-- SMALL-TEAM EDITION (1–10 people). Run in Supabase SQL Editor BEFORE first login.
-- Replace owner@example.com with YOUR real email before running.
-- This allowlist rejects uninvited signups, even when a link is shared.
create table if not exists public.team_allowlist (
  email text primary key,
  role text not null default 'employee' check (role in ('employee','manager')),
  constraint valid_email check (email = lower(trim(email)) and position('@' in email) > 1)
);
insert into public.team_allowlist(email, role)
values ('owner@example.com', 'manager')
on conflict (email) do update set role = excluded.role;
-- Add up to nine employees in SQL Editor using:
-- insert into public.team_allowlist(email,role) values ('person@example.com','employee');
-- For production, keep this table inaccessible through the public API.
revoke all on public.team_allowlist from anon, authenticated;
alter table public.team_allowlist enable row level security;
-- Note: all users are within ONE team, by design.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role text not null default 'employee' check (role in ('employee','manager')),
  created_at timestamptz not null default now()
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  leave_type text not null check (leave_type in ('Vacation','Sick','Personal','Unpaid')),
  start_date date not null,
  end_date date not null,
  note text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint dates_in_order check (end_date >= start_date),
  constraint max_request_length check (end_date <= start_date + 366)
);
create index if not exists leave_requests_user_idx on public.leave_requests (user_id, start_date);
create index if not exists leave_requests_status_idx on public.leave_requests (status, start_date);

create or replace function public.on_new_user() returns trigger
language plpgsql security definer set search_path = public
as $$
declare permitted_role text;
begin
  select role into permitted_role from public.team_allowlist
    where email = lower(trim(coalesce(new.email, '')));
  if permitted_role is null then
    raise exception 'This email is not invited to this Dayoff workspace';
  end if;
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(coalesce(new.email,''),'@',1)),
    lower(trim(coalesce(new.email,''))),
    permitted_role
  ) on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists auth_user_created on auth.users;
create trigger auth_user_created after insert on auth.users
  for each row execute function public.on_new_user();

-- Restrict visibility of leave notes and personal absences to owner and managers;
-- teammates only see approved absences (including their notes in this MVP).
alter table public.profiles enable row level security;
alter table public.leave_requests enable row level security;

create or replace function public.is_manager(check_user uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = check_user and role = 'manager'); $$;

revoke all on function public.is_manager(uuid) from public;
grant execute on function public.is_manager(uuid) to authenticated;

drop policy if exists "team can view profiles" on public.profiles;
create policy "team can view profiles" on public.profiles for select to authenticated using (true);

drop policy if exists "view own manager or approved leave" on public.leave_requests;
create policy "view own manager or approved leave" on public.leave_requests
for select to authenticated
using (user_id = (select auth.uid()) or status = 'approved' or public.is_manager((select auth.uid())));

drop policy if exists "submit own pending leave" on public.leave_requests;
create policy "submit own pending leave" on public.leave_requests
for insert to authenticated
with check (user_id = (select auth.uid()) and status = 'pending' and reviewed_by is null and reviewed_at is null);

-- No client UPDATE or DELETE policy. State changes are validated by RPC.
create or replace function public.change_leave_status(request_id uuid, new_status text)
returns void language plpgsql security definer set search_path = public
as $$
declare r public.leave_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  select * into r from public.leave_requests where id = request_id for update;
  if not found then raise exception 'Request not found'; end if;
  if new_status in ('approved','rejected') then
    if not public.is_manager(auth.uid()) then raise exception 'Manager access required'; end if;
    if r.status <> 'pending' then raise exception 'Only pending requests can be reviewed'; end if;
    if r.user_id = auth.uid() then raise exception 'You cannot approve your own request'; end if;
    update public.leave_requests set status = new_status, reviewed_by = auth.uid(), reviewed_at = now()
      where id = request_id;
  elsif new_status = 'cancelled' then
    if r.user_id <> auth.uid() then raise exception 'Only the owner can cancel'; end if;
    if r.status not in ('pending','approved') then raise exception 'Cannot cancel this request'; end if;
    update public.leave_requests set status = 'cancelled', reviewed_by = null, reviewed_at = null
      where id = request_id;
  else
    raise exception 'Invalid status';
  end if;
end;
$$;
revoke all on function public.change_leave_status(uuid,text) from public;
grant execute on function public.change_leave_status(uuid,text) to authenticated;

-- Security: only the signed-in user can change their name; role is never client-editable.
create or replace function public.update_my_name(new_name text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Login required'; end if;
  if length(trim(new_name)) < 2 or length(trim(new_name)) > 80 then raise exception 'Name must be 2–80 characters'; end if;
  update public.profiles set full_name = trim(new_name) where id = auth.uid();
end;
$$;
revoke all on function public.update_my_name(text) from public;
grant execute on function public.update_my_name(text) to authenticated;

-- Optional audit: verify approved users and roles after onboarding:
-- select email, role from public.profiles order by role, email;

-- Georgia-team leave policy. This section can be run as a migration on an
-- existing workspace; keep the preceding schema and this section together for new installs.
-- First retire the old half-day trigger before converting its records.
drop trigger if exists dayoff_validate_leave on public.leave_requests;
alter table public.leave_requests add column if not exists day_portion text not null default 'full';
alter table public.leave_requests drop constraint if exists leave_requests_day_portion_check;
alter table public.leave_requests add constraint leave_requests_day_portion_check
  check (day_portion in ('full','half') and (day_portion='full' or leave_type in ('Casual','Half-day')));
-- Convert existing half-day leaves to casual half days. They now share one pool.
update public.leave_requests set leave_type='Casual', day_portion='half' where leave_type='Half-day';
alter table public.leave_requests drop constraint if exists leave_requests_leave_type_check;
alter table public.leave_requests add constraint leave_requests_leave_type_check
  check (leave_type in ('Vacation','Unpaid','Casual','Sick','Personal'));

-- Calendar-day logic is distinct from working-day leave logic.
create or replace function public.dayoff_is_nonworking(d date) returns boolean
language plpgsql immutable set search_path = public
as $$
declare
  y integer := extract(year from d)::integer;
  a integer; b integer; c integer; ep integer; eq integer;
  jm integer; jd integer; offset_days integer; easter date;
begin
  if extract(isodow from d) in (6,7) then return true; end if;
  if to_char(d,'MM-DD') in (
    '01-01','01-02','01-03','01-07','01-19','03-03','03-08','04-09',
    '05-09','05-12','05-17','05-26','08-28','10-14','11-23','12-31'
  ) then return true; end if;
  -- Orthodox Easter according to the Julian paschalion, converted to Gregorian.
  a:=y%4; b:=y%7; c:=y%19;
  ep:=(19*c+15)%30;
  eq:=(2*a+4*b-ep+34)%7;
  jm:=(ep+eq+114)/31;
  jd:=(ep+eq+114)%31+1;
  offset_days:=y/100-y/400-2;
  easter:=make_date(y,jm,1)+(jd-1+offset_days);
  return d between easter-2 and easter+1;
end;
$$;

create or replace function public.dayoff_leave_units(
  start_on date, end_on date, kind text, leave_year integer
) returns integer language plpgsql stable set search_path = public
as $$
declare first_day date; last_day date; n integer;
begin
  first_day:=greatest(start_on,make_date(leave_year,1,1));
  last_day:=least(end_on,make_date(leave_year,12,31));
  if first_day>last_day then return 0; end if;
  if kind='Unpaid' then return 2*(last_day-first_day+1); end if;
  select count(*)::integer into n from generate_series(first_day,last_day,interval '1 day') as v(dt)
  where not public.dayoff_is_nonworking(v.dt::date);
  return 2*n;
end;
$$;

-- All allowances are checked in half-day units (2 = 1 day).
-- Casual half-day requests use 1 unit; casual full-day requests use 2 each.
create or replace function public.dayoff_enforce_leave() returns trigger
language plpgsql security definer set search_path = public
as $$
declare y integer; allowed integer; already_used integer; this_units integer;
begin
  if new.day_portion='half' and (new.leave_type<>'Casual' or new.start_date<>new.end_date or public.dayoff_is_nonworking(new.start_date)) then
    raise exception 'Casual half-day leave requires one working date';
  end if;
  if new.leave_type in ('Vacation','Casual') and public.dayoff_leave_units(new.start_date,new.end_date,new.leave_type,extract(year from new.start_date)::integer)=0
    and extract(year from new.start_date)=extract(year from new.end_date) then
    raise exception 'Working-day leave requires at least one working date';
  end if;
  if new.status not in ('pending','approved') or new.leave_type not in ('Vacation','Casual','Unpaid') then return new; end if;
  -- Prevent two simultaneous requests from bypassing a shared balance.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text,0));
  if exists(select 1 from public.leave_requests r where r.user_id=new.user_id
    and r.id<>new.id and r.status in ('pending','approved')
    and r.start_date<=new.end_date and r.end_date>=new.start_date) then
    raise exception 'Leave overlaps an existing active request';
  end if;
  for y in extract(year from new.start_date)::integer..extract(year from new.end_date)::integer loop
    allowed:=case new.leave_type when 'Vacation' then 48 when 'Unpaid' then 30
              when 'Casual' then 10 end;
    select coalesce(sum(case when r.leave_type='Casual' and r.day_portion='half' then
      case when extract(year from r.start_date)::integer=y then 1 else 0 end
      else public.dayoff_leave_units(r.start_date,r.end_date,r.leave_type,y) end),0)
      into already_used from public.leave_requests r
      where r.user_id=new.user_id and r.id<>new.id and r.leave_type=new.leave_type
        and r.status in ('pending','approved') and r.start_date<=make_date(y,12,31)
        and r.end_date>=make_date(y,1,1);
    this_units:=case when new.leave_type='Casual' and new.day_portion='half' then
      case when extract(year from new.start_date)::integer=y then 1 else 0 end
      else public.dayoff_leave_units(new.start_date,new.end_date,new.leave_type,y) end;
    if already_used+this_units>allowed then
      raise exception '% annual allowance exceeded for %: % of % already reserved',new.leave_type,y,already_used,allowed;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists dayoff_validate_leave on public.leave_requests;
create trigger dayoff_validate_leave before insert or update of start_date,end_date,leave_type,day_portion,status,user_id
on public.leave_requests for each row execute function public.dayoff_enforce_leave();

-- Note: existing 'Personal' and 'Sick' entries are preserved as legacy records.
-- The app offers Vacation, Unpaid, and Casual; only Casual allows half-day portions.
