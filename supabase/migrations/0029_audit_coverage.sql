-- ===========================================================================
-- 0029_audit_coverage.sql
--
-- One shared SECURITY DEFINER trigger function writes to audit_log for the
-- security-relevant tables. audit_log's real columns were inspected first and
-- are matched exactly: (actor_id, action, entity, entity_id, changes).
--
-- `action` is the lowercased TG_OP, `entity` is TG_TABLE_NAME, and `changes`
-- holds { old, new } as jsonb with nulls stripped.
-- ===========================================================================

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_entity_id uuid;
  v_changes   jsonb;
begin
  -- settings has a TEXT primary key, so there is no uuid to record; its key
  -- goes into `changes` instead.
  if tg_table_name = 'settings' then
    v_entity_id := null;
  else
    v_entity_id := coalesce(
      (to_jsonb(new) ->> 'id')::uuid,
      (to_jsonb(old) ->> 'id')::uuid,
      (to_jsonb(new) ->> 'product_id')::uuid,
      (to_jsonb(old) ->> 'product_id')::uuid,
      (to_jsonb(new) ->> 'variant_id')::uuid,
      (to_jsonb(old) ->> 'variant_id')::uuid
    );
  end if;

  v_changes := jsonb_strip_nulls(jsonb_build_object(
    'old', case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    'new', case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    'key', case when tg_table_name = 'settings'
                then coalesce(to_jsonb(new) ->> 'key', to_jsonb(old) ->> 'key') end
  ));

  insert into public.audit_log (actor_id, action, entity, entity_id, changes)
  values (auth.uid(), lower(tg_op), tg_table_name, v_entity_id, v_changes);

  return null;
end;
$function$;

-- profiles: creation and removal always; updates only when role or is_active
-- moved. A WHEN clause cannot reference OLD on INSERT, hence two triggers.
drop trigger if exists profiles_audit_ins_del on public.profiles;
create trigger profiles_audit_ins_del
  after insert or delete on public.profiles
  for each row execute function public.audit_row_change();

drop trigger if exists profiles_audit_upd on public.profiles;
create trigger profiles_audit_upd
  after update on public.profiles
  for each row
  when (old.role is distinct from new.role
        or old.is_active is distinct from new.is_active)
  execute function public.audit_row_change();

-- discounts, settings, locations: fully audited, all three operations.
drop trigger if exists discounts_audit on public.discounts;
create trigger discounts_audit
  after insert or update or delete on public.discounts
  for each row execute function public.audit_row_change();

drop trigger if exists settings_audit on public.settings;
create trigger settings_audit
  after insert or update or delete on public.settings
  for each row execute function public.audit_row_change();

drop trigger if exists locations_audit on public.locations;
create trigger locations_audit
  after insert or update or delete on public.locations
  for each row execute function public.audit_row_change();

-- products / product_variants: price movements only. Auditing every column on
-- these would drown the log in stock and copy edits.
drop trigger if exists products_price_audit on public.products;
create trigger products_price_audit
  after update on public.products
  for each row
  when (old.price is distinct from new.price
        or old.compare_at_price is distinct from new.compare_at_price)
  execute function public.audit_row_change();

drop trigger if exists product_variants_price_audit on public.product_variants;
create trigger product_variants_price_audit
  after update on public.product_variants
  for each row
  when (old.price is distinct from new.price)
  execute function public.audit_row_change();

-- Cost tables: every write. Cost is the commercially sensitive figure this
-- whole separation exists to protect, and these tables are low volume.
drop trigger if exists product_costs_audit on public.product_costs;
create trigger product_costs_audit
  after insert or update or delete on public.product_costs
  for each row execute function public.audit_row_change();

drop trigger if exists variant_costs_audit on public.variant_costs;
create trigger variant_costs_audit
  after insert or update or delete on public.variant_costs
  for each row execute function public.audit_row_change();
