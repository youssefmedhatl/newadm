-- ===========================================================================
-- 0007_cms_settings.sql — store settings, storefront CMS content,
--                         admin notifications, audit log
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Settings: a single-row-per-key JSON store. Readable by everyone (the
-- storefront needs store name / currency), writable by managers only.
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  is_public   boolean not null default true,
  description text,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Storefront CMS — everything the shop owner can change without a developer.
-- ---------------------------------------------------------------------------
create table if not exists public.content_blocks (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,          -- 'hero', 'promo', 'about'
  kind        text not null default 'hero',  -- hero | promo | banner | richtext
  title_en    text,
  title_ar    text,
  subtitle_en text,
  subtitle_ar text,
  body_en     text,
  body_ar     text,
  cta_label_en text,
  cta_label_ar text,
  cta_href    text,
  media_url   text,                          -- video or image
  media_type  text default 'video',          -- video | image
  is_active   boolean not null default true,
  position    int not null default 0,
  updated_at  timestamptz not null default now()
);

drop trigger if exists content_blocks_set_updated_at on public.content_blocks;
create trigger content_blocks_set_updated_at before update on public.content_blocks
  for each row execute function public.set_updated_at();

-- The scrolling ticker under the nav.
create table if not exists public.marquee_messages (
  id        uuid primary key default gen_random_uuid(),
  text_en   text not null,
  text_ar   text not null,
  is_active boolean not null default true,
  position  int not null default 0
);

-- ---------------------------------------------------------------------------
-- Admin notifications (low stock, new online order, big variance...)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  type        text not null,            -- 'low_stock' | 'new_order' | 'return_request'
  severity    text not null default 'info',   -- info | warning | critical
  title       text not null,
  body        text,
  link        text,
  entity_type text,
  entity_id   uuid,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_unread_idx
  on public.notifications(is_read, created_at desc);

-- Raise a notification when stock drops to/below the reorder point.
create or replace function public.notify_low_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_sku  text;
  v_loc  text;
begin
  if new.quantity > new.reorder_point then
    return new;
  end if;

  -- Don't spam: only fire when we actually crossed the threshold.
  if tg_op = 'UPDATE' and old.quantity <= old.reorder_point then
    return new;
  end if;

  select p.name_en, v.sku into v_name, v_sku
  from public.product_variants v
  join public.products p on p.id = v.product_id
  where v.id = new.variant_id;

  select name_en into v_loc from public.locations where id = new.location_id;

  insert into public.notifications (type, severity, title, body, entity_type, entity_id, link)
  values (
    'low_stock',
    case when new.quantity <= 0 then 'critical' else 'warning' end,
    case when new.quantity <= 0 then 'Out of stock' else 'Low stock' end,
    coalesce(v_name, 'Item') || ' (' || coalesce(v_sku, '—') || ') — '
      || new.quantity || ' left at ' || coalesce(v_loc, 'store'),
    'variant',
    new.variant_id,
    '/admin/inventory'
  );

  return new;
end;
$$;

drop trigger if exists inventory_low_stock_notify on public.inventory_levels;
create trigger inventory_low_stock_notify
  after insert or update of quantity on public.inventory_levels
  for each row execute function public.notify_low_stock();

-- ---------------------------------------------------------------------------
-- Audit log — who changed what, for the tables that matter.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,           -- INSERT | UPDATE | DELETE
  entity      text not null,           -- table name
  entity_id   uuid,
  changes     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_created_idx on public.audit_log(created_at desc);
create index if not exists audit_entity_idx  on public.audit_log(entity, entity_id);

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec_id  uuid;
  diff    jsonb;
begin
  rec_id := case when tg_op = 'DELETE' then (to_jsonb(old)->>'id')::uuid
                 else (to_jsonb(new)->>'id')::uuid end;

  if tg_op = 'UPDATE' then
    -- Only store the fields that actually changed.
    select jsonb_object_agg(key, jsonb_build_object('from', old_val, 'to', new_val))
      into diff
    from (
      select n.key,
             o.value as old_val,
             n.value as new_val
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o on o.key = n.key
      where n.value is distinct from o.value
        and n.key not in ('updated_at')
    ) changed;

    if diff is null then
      return null;   -- nothing meaningful changed
    end if;
  elsif tg_op = 'INSERT' then
    diff := jsonb_build_object('new', to_jsonb(new));
  else
    diff := jsonb_build_object('old', to_jsonb(old));
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, changes)
  values (auth.uid(), tg_op, tg_table_name, rec_id, diff);

  return null;
end;
$$;

drop trigger if exists audit_products    on public.products;
drop trigger if exists audit_variants    on public.product_variants;
drop trigger if exists audit_discounts   on public.discounts;
drop trigger if exists audit_profiles    on public.profiles;
drop trigger if exists audit_settings    on public.settings;

create trigger audit_products  after insert or update or delete on public.products
  for each row execute function public.write_audit_log();
create trigger audit_variants  after insert or update or delete on public.product_variants
  for each row execute function public.write_audit_log();
create trigger audit_discounts after insert or update or delete on public.discounts
  for each row execute function public.write_audit_log();
create trigger audit_profiles  after insert or update or delete on public.profiles
  for each row execute function public.write_audit_log();
create trigger audit_settings  after insert or update or delete on public.settings
  for each row execute function public.write_audit_log();
