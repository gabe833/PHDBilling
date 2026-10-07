-- =====================================================================
-- PHD Billing — QuickBooks hourly sync (applied 2026-10-07; kept here for reference).
-- Safe to run again: it replaces the schedule instead of adding a second one.
-- Uses the same private token as the MagicDoor and Nickel schedules.
-- =====================================================================

-- hourly server snapshots are kept out of the activity log (each is rewritten every hour)
create or replace function public.docs_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'shared' and new.id in ('magicdoor', 'nickel', 'qbo') then return null; end if;
  insert into public.audit_log (actor, kind, doc_id, action, data)
  values (public.current_email(), new.kind, new.id,
          case when tg_op = 'INSERT' then 'INSERT' when new.deleted and not old.deleted then 'DELETE' else 'UPDATE' end,
          new.data);
  return null;
end $$;

-- QuickBooks sync at 22 minutes past every hour
select cron.unschedule(jobid) from cron.job where jobname = 'qbo-sync';
select cron.schedule('qbo-sync', '22 * * * *', $job$
  select net.http_post(
    url := 'https://skeuyevmbxtkjusmrmdd.supabase.co/functions/v1/qbo',
    body := '{"mode":"sync"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-md-cron', (select value from public.private_settings where key = 'md_cron_token')),
    timeout_milliseconds := 120000);
$job$);

select jobname, schedule, active from cron.job order by jobname;
