-- =====================================================================
-- PHD Billing — MagicDoor hourly sync. Run once in Supabase → SQL Editor.
-- Safe to run again: it replaces the schedule instead of adding a second one.
-- =====================================================================

-- 1. The two built-in extensions the schedule uses (web requests + timer)
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 2. The MagicDoor snapshot is rewritten every hour; keep it out of the activity log
--    so the free plan's 500 MB isn't filled with copies of it. Every other save is still logged.
create or replace function public.docs_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'shared' and new.id = 'magicdoor' then return null; end if;
  insert into public.audit_log (actor, kind, doc_id, action, data)
  values (public.current_email(), new.kind, new.id,
          case when tg_op = 'INSERT' then 'INSERT' when new.deleted and not old.deleted then 'DELETE' else 'UPDATE' end,
          new.data);
  return null;
end $$;

-- 3. A private token only the database and the magicdoor function know.
--    The schedule sends it; with it, the function can run a sync and nothing else.
delete from public.private_settings where key = 'md_admin_token';      -- left over from setup; no longer used
insert into public.private_settings (key, value)
values ('md_cron_token', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do update set value = excluded.value;

-- 4. Sync at 7 minutes past every hour
select cron.unschedule(jobid) from cron.job where jobname = 'magicdoor-sync';
select cron.schedule('magicdoor-sync', '7 * * * *', $job$
  select net.http_post(
    url := 'https://skeuyevmbxtkjusmrmdd.supabase.co/functions/v1/magicdoor',
    body := '{"mode":"sync"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-md-cron', (select value from public.private_settings where key = 'md_cron_token')),
    timeout_milliseconds := 120000);
$job$);

-- 5. Check: one row named magicdoor-sync
select jobname, schedule, active from cron.job where jobname = 'magicdoor-sync';
