-- ===========================================================================
-- 0026_order_event_codes.sql
--
-- order_events.message was written in English ("Order VT-1002 created") and
-- rendered untranslated in the Arabic timeline. Events now also carry a stable
-- event_code plus event_params, which the UI translates. The old `message`
-- column is left populated so nothing is lost and the UI can fall back to it
-- for rows written before this migration.
--
-- NOTE: the plan named order_created / order_completed / order_cancelled /
-- return_processed. The live writer (log_order_status_change) only ever emits
-- three kinds of event — 'created', 'status_changed' and 'payment_changed' —
-- and completion and cancellation both arrive as a status_changed carrying
-- from/to. Nothing writes a return event to this table at all. So the codes
-- used are the three that actually occur, and no code was invented for events
-- the system does not produce.
-- ===========================================================================

alter table public.order_events
  add column if not exists event_code text,
  add column if not exists event_params jsonb not null default '{}'::jsonb;

-- Backfill what is recognisable. The old `message` column stays populated so no
-- history is lost and the UI can fall back to it.
update public.order_events
   set event_code = 'order_created',
       event_params = jsonb_build_object(
         'order_number', coalesce(
           (select o.order_number from public.orders o where o.id = order_events.order_id),
           btrim(replace(replace(message, 'Order ', ''), ' created', ''))))
 where event_code is null and type = 'created';

update public.order_events
   set event_code = 'order_status_changed',
       event_params = coalesce(meta, '{}'::jsonb)
 where event_code is null and type = 'status_changed';

update public.order_events
   set event_code = 'order_payment_changed',
       event_params = coalesce(meta, '{}'::jsonb)
 where event_code is null and type = 'payment_changed';

CREATE OR REPLACE FUNCTION public.log_order_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, type, message, event_code, event_params, created_by)
    values (new.id, 'created', 'Order ' || new.order_number || ' created',
            'order_created',
            jsonb_build_object('order_number', new.order_number),
            auth.uid());
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.order_events (order_id, type, message, meta, event_code, event_params, created_by)
    values (new.id, 'status_changed',
            old.status::text || ' -> ' || new.status::text,
            jsonb_build_object('from', old.status, 'to', new.status),
            'order_status_changed',
            jsonb_build_object('from', old.status, 'to', new.status),
            auth.uid());
  end if;

  if new.payment_status is distinct from old.payment_status then
    insert into public.order_events (order_id, type, message, meta, event_code, event_params, created_by)
    values (new.id, 'payment_changed',
            old.payment_status::text || ' -> ' || new.payment_status::text,
            jsonb_build_object('from', old.payment_status, 'to', new.payment_status),
            'order_payment_changed',
            jsonb_build_object('from', old.payment_status, 'to', new.payment_status),
            auth.uid());
  end if;

  return new;
end;
$function$;
