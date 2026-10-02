-- PHD console: Payments (Nickel + QuickBooks) setup
-- Run in Supabase → SQL Editor. Safe to re-run.

-- 1) WHO MAY SEND MONEY. Only these Google sign-ins can pay vendors or cancel payments.
--    Everyone else on staff can still add bills and invoices. Edit the list, then run.
insert into public.private_settings (key, value)
values ('payers', 'gabe@phdproperties.realestate')          -- comma-separated emails
on conflict (key) do update set value = excluded.value;

-- 2) HOURLY CHECK of Nickel payment status (already created; re-running just replaces it).
select cron.unschedule('payments-refresh')
where exists (select 1 from cron.job where jobname = 'payments-refresh');
select cron.schedule('payments-refresh', '37 * * * *', $$
  select net.http_post(
    url := 'https://skeuyevmbxtkjusmrmdd.supabase.co/functions/v1/payments',
    body := '{"mode":"nickel.refresh"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-md-cron', (select value from public.private_settings where key = 'md_cron_token')),
    timeout_milliseconds := 120000);
$$);

-- 3) Check: who can pay, and the scheduled jobs
select key, value from public.private_settings where key = 'payers';
select jobname, schedule from cron.job order by jobname;
