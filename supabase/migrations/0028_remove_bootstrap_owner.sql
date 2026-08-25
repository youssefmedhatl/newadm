-- ===========================================================================
-- 0028_remove_bootstrap_owner.sql
--
-- handle_new_user() promoted the first signup to 'owner' when no staff profile
-- existed. An owner exists, so that branch is now only a way in.
--
-- The metadata handling (full_name / phone) and `on conflict (id) do nothing`
-- are unchanged; only the role decision became a constant.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Every signup is a customer. Full stop.
  --
  -- This function used to promote the first signup to 'owner' whenever no staff
  -- profile existed. An owner exists now, so that branch was a spare key under
  -- the mat: anyone who could empty or race the profiles table could mint
  -- themselves an owner account.
  --
  -- Recovering from a total loss of admin accounts is DELIBERATELY a Supabase
  -- dashboard operation now — promote a profile by hand with the service role.
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone',
    'customer'
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;
