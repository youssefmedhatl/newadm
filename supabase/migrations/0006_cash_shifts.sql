-- ===========================================================================
-- 0006_cash_shifts.sql — cash drawer shifts, cash movements, expenses
--
-- A shift opens with a float, records every cash in/out, and closes with a
-- physical count. `variance = counted - expected` is what the owner actually
-- cares about at the end of the day.
-- ===========================================================================

create table if not exists public.shifts (
  id             uuid primary key default gen_random_uuid(),
  location_id    uuid not null references public.locations(id) on delete restrict,
  status         public.shift_status not null default 'open',
  opened_by      uuid references public.profiles(id) on delete set null,
  opened_at      timestamptz not null default now(),
  opening_float  numeric(12,2) not null default 0 check (opening_float >= 0),
  closed_by      uuid references public.profiles(id) on delete set null,
  closed_at      timestamptz,
  counted_cash   numeric(12,2),
  expected_cash  numeric(12,2),
  variance       numeric(12,2),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists shifts_location_idx on public.shifts(location_id, opened_at desc);
-- Only one open shift per location at a time.
create unique index if not exists shifts_one_open_per_location
  on public.shifts(location_id) where status = 'open';

drop trigger if exists shifts_set_updated_at on public.shifts;
create trigger shifts_set_updated_at before update on public.shifts
  for each row execute function public.set_updated_at();

-- orders.shift_id / returns.shift_id FKs (shifts didn't exist in 0005)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_shift_id_fkey') then
    alter table public.orders
      add constraint orders_shift_id_fkey
      foreign key (shift_id) references public.shifts(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'returns_shift_id_fkey') then
    alter table public.returns
      add constraint returns_shift_id_fkey
      foreign key (shift_id) references public.shifts(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
create table if not exists public.cash_movements (
  id          uuid primary key default gen_random_uuid(),
  shift_id    uuid not null references public.shifts(id) on delete cascade,
  type        public.cash_movement_type not null,
  amount      numeric(12,2) not null,        -- signed: + into drawer, - out
  reason      text,
  order_id    uuid references public.orders(id) on delete set null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists cash_moves_shift_idx on public.cash_movements(shift_id, created_at);

-- ---------------------------------------------------------------------------
create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  location_id uuid references public.locations(id) on delete set null,
  shift_id    uuid references public.shifts(id) on delete set null,
  category    text not null default 'general',   -- rent, salaries, supplies, ...
  amount      numeric(12,2) not null check (amount > 0),
  note        text,
  spent_on    date not null default current_date,
  paid_from_drawer boolean not null default true,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists expenses_date_idx on public.expenses(spent_on desc);

-- An expense paid out of the till is also a cash movement.
create or replace function public.link_expense_to_drawer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.paid_from_drawer and new.shift_id is not null then
    insert into public.cash_movements (shift_id, type, amount, reason, created_by)
    values (new.shift_id, 'expense', -new.amount,
            coalesce(new.note, new.category), new.created_by);
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_to_drawer on public.expenses;
create trigger expenses_to_drawer
  after insert on public.expenses
  for each row execute function public.link_expense_to_drawer();

-- ---------------------------------------------------------------------------
-- Shift operations
-- ---------------------------------------------------------------------------
create or replace function public.open_shift(
  p_location_id uuid,
  p_opening_float numeric default 0
)
returns public.shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.shifts;
begin
  if not public.is_staff() then
    raise exception 'Not authorised to open a shift';
  end if;

  if exists (select 1 from public.shifts where location_id = p_location_id and status = 'open') then
    raise exception 'There is already an open shift at this location';
  end if;

  insert into public.shifts (location_id, opened_by, opening_float)
  values (p_location_id, auth.uid(), coalesce(p_opening_float, 0))
  returning * into s;

  if s.opening_float > 0 then
    insert into public.cash_movements (shift_id, type, amount, reason, created_by)
    values (s.id, 'opening_float', s.opening_float, 'Opening float', auth.uid());
  end if;

  return s;
end;
$$;

-- What the drawer *should* hold right now.
create or replace function public.shift_expected_cash(p_shift_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)
  from public.cash_movements
  where shift_id = p_shift_id and type <> 'closing';
$$;

create or replace function public.close_shift(
  p_shift_id uuid,
  p_counted_cash numeric,
  p_notes text default null
)
returns public.shifts
language plpgsql
security definer
set search_path = public
as $$
declare
  s        public.shifts;
  expected numeric;
begin
  if not public.is_staff() then
    raise exception 'Not authorised to close a shift';
  end if;

  select * into s from public.shifts where id = p_shift_id for update;
  if s is null then
    raise exception 'Shift not found';
  end if;
  if s.status = 'closed' then
    raise exception 'Shift is already closed';
  end if;

  expected := public.shift_expected_cash(p_shift_id);

  update public.shifts
    set status        = 'closed',
        closed_by     = auth.uid(),
        closed_at     = now(),
        counted_cash  = p_counted_cash,
        expected_cash = expected,
        variance      = p_counted_cash - expected,
        notes         = coalesce(p_notes, notes)
    where id = p_shift_id
    returning * into s;

  return s;
end;
$$;

-- Manual pay-in / pay-out (e.g. taking cash to the bank).
create or replace function public.record_cash_movement(
  p_shift_id uuid,
  p_type public.cash_movement_type,
  p_amount numeric,
  p_reason text default null
)
returns public.cash_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.cash_movements;
begin
  if not public.is_staff() then
    raise exception 'Not authorised';
  end if;

  if p_type not in ('pay_in','pay_out') then
    raise exception 'Only pay_in and pay_out can be recorded manually';
  end if;

  if p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  insert into public.cash_movements (shift_id, type, amount, reason, created_by)
  values (
    p_shift_id,
    p_type,
    case when p_type = 'pay_out' then -p_amount else p_amount end,
    p_reason,
    auth.uid()
  )
  returning * into m;

  return m;
end;
$$;
