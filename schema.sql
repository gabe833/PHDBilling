-- =====================================================================
-- PHD Billing — database setup for Supabase
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run again: it only creates what's missing.
--
-- Security model
--   · Only people on the `staff` list can read or change anything.
--     Signing in with Google proves who you are; the staff list decides access.
--   · Nothing is ever hard-deleted from the app: rows are marked deleted,
--     and every insert/update is copied into `audit_log` with who and when.
--   · Saves are versioned: an update only succeeds against the version the
--     person loaded, so two people can't silently overwrite each other.
-- =====================================================================

-- ---------- who has access ----------
create table if not exists public.staff (
  email      text primary key check (email = lower(email)),
  name       text,
  active     boolean not null default true,
  added_by   text,
  added_at   timestamptz not null default now()
);

create or replace function public.current_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where email = public.current_email() and active)
$$;
revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated;

-- ---------- every record the console keeps ----------
create table if not exists public.docs (
  kind        text not null,            -- pj_property | shared | pm_property | pm_row | pm_meta | pm_deposit | pm_bill | pm_invoice
  id          text not null,
  data        jsonb not null,
  version     integer not null default 1,
  deleted     boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  primary key (kind, id),
  constraint docs_kind_ok check (kind in ('pj_property','shared','pm_property','pm_row','pm_meta','pm_deposit','pm_bill','pm_invoice')),
  constraint docs_size_ok check (pg_column_size(data) < 2000000)
);

create table if not exists public.audit_log (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  actor    text,
  kind     text,
  doc_id   text,
  action   text,
  data     jsonb
);
create index if not exists audit_log_at on public.audit_log (at desc);

-- version bump + stamp who saved (never trusted from the browser)
create or replace function public.docs_stamp() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    new.kind := old.kind; new.id := old.id;          -- keys can't be changed
  else
    new.version := 1;
  end if;
  new.updated_at := now();
  new.updated_by := public.current_email();
  return new;
end $$;
drop trigger if exists docs_stamp on public.docs;
create trigger docs_stamp before insert or update on public.docs
  for each row execute function public.docs_stamp();

create or replace function public.docs_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'shared' and new.id = 'magicdoor' then return null; end if;   -- hourly MagicDoor snapshot isn't logged
  insert into public.audit_log (actor, kind, doc_id, action, data)
  values (public.current_email(), new.kind, new.id,
          case when tg_op = 'INSERT' then 'INSERT' when new.deleted and not old.deleted then 'DELETE' else 'UPDATE' end,
          new.data);
  return null;
end $$;
drop trigger if exists docs_audit on public.docs;
create trigger docs_audit after insert or update on public.docs
  for each row execute function public.docs_audit();

-- ---------- row level security ----------
alter table public.staff     enable row level security;
alter table public.docs      enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists staff_read   on public.staff;
drop policy if exists staff_add    on public.staff;
drop policy if exists staff_change on public.staff;
create policy staff_read   on public.staff for select to authenticated using (public.is_staff() or email = public.current_email());
create policy staff_add    on public.staff for insert to authenticated with check (public.is_staff());
create policy staff_change on public.staff for update to authenticated using (public.is_staff()) with check (public.is_staff());
-- no delete policy: people are removed by switching `active` off, so history keeps their name

drop policy if exists docs_read   on public.docs;
drop policy if exists docs_add    on public.docs;
drop policy if exists docs_change on public.docs;
create policy docs_read   on public.docs for select to authenticated using (public.is_staff());
create policy docs_add    on public.docs for insert to authenticated with check (public.is_staff());
create policy docs_change on public.docs for update to authenticated using (public.is_staff()) with check (public.is_staff());
-- no delete policy: records are only ever marked deleted

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated using (public.is_staff());
-- no insert/update/delete policies: only the trigger writes the log, and nobody can edit it

revoke all on public.staff, public.docs, public.audit_log from anon;
grant select, insert, update on public.staff, public.docs to authenticated;
grant select on public.audit_log to authenticated;

-- ---------- live updates ----------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;

-- ---------- nightly backup (free plan has no backups of its own) ----------
-- A private settings table the API can't read at all (RLS on, no policies).
create table if not exists public.private_settings (key text primary key, value text not null);
alter table public.private_settings enable row level security;
revoke all on public.private_settings from anon, authenticated;
insert into public.private_settings (key, value)
values ('backup_token', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- The Google Apps Script calls this once a night with the backup token. It can only
-- read (plus trim the activity log to 180 days so the free 500 MB never fills up).
create or replace function public.backup_export(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or length(p_token) < 32
     or not exists (select 1 from public.private_settings where key = 'backup_token' and value = p_token) then
    raise exception 'unauthorized';
  end if;
  delete from public.audit_log where at < now() - interval '180 days';
  return jsonb_build_object(
    'kind', 'phd-office-backup', 'exported_at', now(),
    'docs',  (select coalesce(jsonb_agg(to_jsonb(d) order by d.kind, d.id), '[]'::jsonb) from public.docs d),
    'staff', (select coalesce(jsonb_agg(to_jsonb(s) order by s.email), '[]'::jsonb) from public.staff s));
end $$;
revoke all on function public.backup_export(text) from public;
grant execute on function public.backup_export(text) to anon, authenticated;

-- See the token (paste it into the Apps Script's Script Properties as BACKUP_TOKEN):
--   select value from public.private_settings where key = 'backup_token';

-- =====================================================================
-- LAST STEP — put yourself on the team (use the Google address you sign in with):
--
--   insert into public.staff (email, name) values ('you@phdproperties.realestate', 'Your Name')
--   on conflict (email) do update set active = true;
--
-- Everyone after that is added from the Team page inside the console.
-- =====================================================================
-- ---------------------------------------------------------------------
-- Activity log: what exactly changed in each saved edit, and a leaner audit log
-- ---------------------------------------------------------------------
create index if not exists audit_log_doc on public.audit_log (kind, doc_id, at desc, id desc);
create index if not exists audit_log_person on public.audit_log (at desc, id desc) where actor is not null and actor <> '';

-- a value small enough to show: long text cut, nested lists and objects summarised
create or replace function public.jsonb_brief(v jsonb) returns jsonb language sql immutable as $$
  select case jsonb_typeof(v)
    when 'string' then case when length(v #>> '{}') > 200 then to_jsonb(left(v #>> '{}', 200) || '…') else v end
    when 'object' then coalesce((select jsonb_object_agg(e.key,
        case jsonb_typeof(e.value)
          when 'string' then case when length(e.value #>> '{}') > 160 then to_jsonb(left(e.value #>> '{}', 160) || '…') else e.value end
          when 'array' then jsonb_build_object('_n', jsonb_array_length(e.value))
          when 'object' then jsonb_build_object('_keys', (select count(*) from jsonb_object_keys(e.value)))
          else e.value end)
      from (select key, value from jsonb_each(v) limit 40) e), '{}'::jsonb)
    when 'array' then case when jsonb_array_length(v) <= 8 and not exists (select 1 from jsonb_array_elements(v) x where jsonb_typeof(x) in ('object', 'array'))
      then v else jsonb_build_object('_n', jsonb_array_length(v)) end
    else v end
$$;

-- what differs between two versions of a document, as a short list:
--   {p:"rentReceived", o:2200, n:2300}                    a field changed
--   {p:"repairItems", op:"add"|"del", v:{…}}              a list entry added or removed
--   {p:"repairItems", op:"chg", v:{…}, d:[…]}             a list entry changed (d = its own changes)
create or replace function public.jsonb_diff(a jsonb, b jsonb, path text default '', depth int default 0)
returns jsonb language plpgsql immutable as $$
declare out jsonb := '[]'::jsonb; k text; r record;
begin
  if a is not distinct from b then return out; end if;
  if jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' and depth < 3 then
    for k in select key from (select jsonb_object_keys(a) as key union select jsonb_object_keys(b)) s order by 1 loop
      if (a -> k) is distinct from (b -> k) then
        out := out || public.jsonb_diff(a -> k, b -> k, case when path = '' then k else path || '.' || k end, depth + 1);
      end if;
    end loop;
    return out;
  end if;
  if depth < 3 and coalesce(jsonb_typeof(a), 'array') = 'array' and coalesce(jsonb_typeof(b), 'array') = 'array' and coalesce(jsonb_typeof(a), jsonb_typeof(b)) = 'array'
     and exists (select 1 from jsonb_array_elements(coalesce(a, '[]'::jsonb) || coalesce(b, '[]'::jsonb)) e where jsonb_typeof(e) = 'object' and e ? 'id') then
    for r in
      select x.e as ea, y.e as eb
      from jsonb_array_elements(coalesce(a, '[]'::jsonb)) x(e)
      full join jsonb_array_elements(coalesce(b, '[]'::jsonb)) y(e) on (x.e ->> 'id') = (y.e ->> 'id')
      where x.e is distinct from y.e
    loop
      if r.ea is null then out := out || jsonb_build_array(jsonb_build_object('p', path, 'op', 'add', 'v', public.jsonb_brief(r.eb)));
      elsif r.eb is null then out := out || jsonb_build_array(jsonb_build_object('p', path, 'op', 'del', 'v', public.jsonb_brief(r.ea)));
      else out := out || jsonb_build_array(jsonb_build_object('p', path, 'op', 'chg', 'v', public.jsonb_brief(r.eb), 'd', public.jsonb_diff(r.ea, r.eb, '', depth + 1)));
      end if;
    end loop;
    return out;
  end if;
  return jsonb_build_array(jsonb_build_object('p', path, 'o', public.jsonb_brief(a), 'n', public.jsonb_brief(b)));
end $$;

-- every change a person saved, newest first, each with what changed since the version before it
-- (runs as the caller, so the audit log's own access rules apply)
create or replace function public.team_activity(lim int default 200, before timestamptz default null, who text default null)
returns table (id bigint, at timestamptz, actor text, kind text, doc_id text, action text, first boolean, diff jsonb, doc jsonb)
language sql stable security invoker set search_path to 'public' as $$
  select a.id, a.at, a.actor, a.kind, a.doc_id, a.action, p.id is null,
         case when p.id is null then null else public.jsonb_diff(p.data, a.data) end,
         public.jsonb_brief(a.data)
  from (select * from public.audit_log x
        where x.actor is not null and x.actor <> '' and not (x.kind = 'shared' and x.doc_id like 'activity:%')
          and (before is null or x.at < before) and (who is null or x.actor = who)
        order by x.at desc, x.id desc limit least(greatest(coalesce(lim, 200), 1), 500)) a
  left join lateral (select q.id, q.data from public.audit_log q
        where q.kind = a.kind and q.doc_id = a.doc_id and (q.at < a.at or (q.at = a.at and q.id < a.id))
        order by q.at desc, q.id desc limit 1) p on true
  order by a.at desc, a.id desc
$$;
grant execute on function public.team_activity(int, timestamptz, text) to authenticated;

-- the audit trigger: a save that changes nothing isn't logged, and the hourly copies of Nickel and QuickBooks
-- (re-read from those services every hour, megabytes each) are kept once a day instead of every run
create or replace function public.docs_audit() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare who text := public.current_email();
begin
  if new.kind = 'shared' and new.id = 'magicdoor' then return null; end if;   -- hourly MagicDoor snapshot isn't logged
  if tg_op = 'UPDATE' and new.data is not distinct from old.data and new.deleted is not distinct from old.deleted then return null; end if;
  if new.kind = 'shared' and new.id in ('nickel', 'qbo') and coalesce(who, '') = ''
     and exists (select 1 from public.audit_log l where l.kind = new.kind and l.doc_id = new.id and l.at > now() - interval '20 hours') then return null; end if;
  insert into public.audit_log (actor, kind, doc_id, action, data)
  values (who, new.kind, new.id,
          case when tg_op = 'INSERT' then 'INSERT' when new.deleted and not old.deleted then 'DELETE' else 'UPDATE' end,
          new.data);
  return null;
end $function$;
