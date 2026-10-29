-- =====================================================================
-- OFFICE (HR / admin): pay, commissions, MLS dues, money owed to the firm.
-- Records live in public.docs with kind = 'hr'. They are NOT visible to the
-- whole team like everything else: an admin (staff.admin) sees all of them;
-- anyone else sees only records whose data->>'email' is their own login, and
-- can only add or edit their own entries while they're draft or submitted.
-- Approving a pay run is stamped by the database with who did it, and nobody
-- can approve a run they're paid in.
-- =====================================================================

alter table public.staff add column if not exists admin boolean not null default false;
-- who's an admin is set separately (Team settings / a one-line update), not in this public file

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where email = public.current_email() and active and admin)
$$;

-- only an admin can make someone an admin (the Team page lets any staff member add people)
create or replace function public.staff_admin_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.current_email() = '' then return new; end if;                 -- the service role / SQL editor
  if tg_op = 'INSERT' and new.admin and not public.is_admin() then raise exception 'Only an admin can add an admin'; end if;
  if tg_op = 'UPDATE' and new.admin is distinct from old.admin and not public.is_admin() then raise exception 'Only an admin can change who is an admin'; end if;
  return new;
end $$;
drop trigger if exists staff_admin_guard on public.staff;
create trigger staff_admin_guard before insert or update on public.staff for each row execute function public.staff_admin_guard();

-- the new kind
alter table public.docs drop constraint if exists docs_kind_ok;
alter table public.docs add constraint docs_kind_ok check (kind in ('pj_property','shared','pm_property','pm_row','pm_meta','pm_deposit','pm_bill','pm_invoice','hr'));

-- everything else stays shared with the whole team; hr gets its own rules
drop policy if exists docs_read   on public.docs;
drop policy if exists docs_add    on public.docs;
drop policy if exists docs_change on public.docs;
create policy docs_read   on public.docs for select to authenticated using (public.is_staff() and kind <> 'hr');
create policy docs_add    on public.docs for insert to authenticated with check (public.is_staff() and kind <> 'hr');
create policy docs_change on public.docs for update to authenticated using (public.is_staff() and kind <> 'hr') with check (public.is_staff() and kind <> 'hr');

drop policy if exists hr_read   on public.docs;
drop policy if exists hr_add    on public.docs;
drop policy if exists hr_change on public.docs;
create policy hr_read on public.docs for select to authenticated
  using (kind = 'hr' and public.is_staff() and (public.is_admin() or lower(coalesce(data->>'email', '')) = public.current_email()));
create policy hr_add on public.docs for insert to authenticated
  with check (kind = 'hr' and public.is_staff() and (public.is_admin() or
    (id like 'entry:%' and lower(coalesce(data->>'email', '')) = public.current_email() and coalesce(data->>'status', '') in ('draft', 'submitted'))));
create policy hr_change on public.docs for update to authenticated
  using (kind = 'hr' and public.is_staff() and (public.is_admin() or
    (id like 'entry:%' and lower(coalesce(data->>'email', '')) = public.current_email() and coalesce(data->>'status', '') in ('draft', 'submitted', 'rejected'))))
  with check (kind = 'hr' and public.is_staff() and (public.is_admin() or
    (id like 'entry:%' and lower(coalesce(data->>'email', '')) = public.current_email() and coalesce(data->>'status', '') in ('draft', 'submitted'))));

-- the change history: hr changes are visible to admins only
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated
  using (public.is_staff() and (kind is distinct from 'hr' or public.is_admin()));

-- approving a pay run: stamped with who and when; never by someone paid in it
create or replace function public.hr_approval_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare me text := public.current_email();
begin
  if new.kind <> 'hr' or new.id not like 'run:%' then return new; end if;
  if coalesce(new.data->>'status', '') = 'approved' and (tg_op = 'INSERT' or coalesce(old.data->>'status', '') <> 'approved') then
    if me <> '' and exists (select 1 from jsonb_array_elements(coalesce(new.data->'lines', '[]'::jsonb)) l where lower(coalesce(l->>'email', '')) = me) then
      raise exception 'You can''t approve a pay run you are paid in — someone else has to approve it';
    end if;
    -- when the office has named approvers (Office → People → Approvers), only they can approve
    if me <> '' and exists (select 1 from public.docs s where s.kind = 'hr' and s.id = 'settings' and jsonb_array_length(coalesce(s.data->'approvers', '[]'::jsonb)) > 0)
       and not exists (select 1 from public.docs s where s.kind = 'hr' and s.id = 'settings' and coalesce(s.data->'approvers', '[]'::jsonb) ? me) then
      raise exception 'Only the office''s approvers can approve pay runs';
    end if;
    new.data := jsonb_set(jsonb_set(new.data, '{approvedBy}', to_jsonb(me)), '{approvedAt}', to_jsonb(now()));
  end if;
  return new;
end $$;
drop trigger if exists hr_approval_guard on public.docs;
create trigger hr_approval_guard before insert or update on public.docs for each row execute function public.hr_approval_guard();
