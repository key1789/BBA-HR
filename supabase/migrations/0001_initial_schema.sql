-- BBA HR - Supabase Initial Schema v1
-- Covers: multi-tenant RBAC, core HR workflows, payroll v1, notifications, exports, activity logs.

create extension if not exists pgcrypto;

-- =========================
-- Enums
-- =========================
create type public.role_name as enum (
  'super_admin_bba',
  'crew',
  'admin_apotek',
  'owner'
);

create type public.workforce_request_status as enum (
  'draft',
  'submitted',
  'revision_required',
  'approved',
  'rejected'
);

create type public.candidate_status as enum (
  'new',
  'screening_passed',
  'screening_failed',
  'interview_scheduled',
  'interviewed',
  'hired',
  'rejected',
  'hold'
);

create type public.task_status as enum (
  'open',
  'assigned',
  'in_progress',
  'submitted',
  'revision_required',
  'approved',
  'closed'
);

create type public.task_approval_action as enum (
  'approved',
  'revision_required',
  'rejected'
);

create type public.payroll_status as enum (
  'draft',
  'submitted',
  'approved',
  'paid'
);

create type public.export_status as enum (
  'queued',
  'processing',
  'completed',
  'failed'
);

create type public.export_format as enum (
  'csv',
  'pdf'
);

-- =========================
-- Core tenancy and identity
-- =========================
create table public.tenant_apotek (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tenant_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  role public.role_name not null,
  is_active boolean not null default true,
  assigned_at timestamptz not null default now(),
  unique (tenant_apotek_id, user_id, role)
);

-- =========================
-- Core HR domain
-- =========================
create table public.workforce_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  requested_by_user_id uuid not null references public.app_users(id),
  position_title text not null,
  headcount_needed integer not null check (headcount_needed > 0),
  employment_type text not null,
  priority_level text not null,
  target_join_date date not null,
  notes text,
  status public.workforce_request_status not null default 'draft',
  reviewed_by_user_id uuid references public.app_users(id),
  review_notes text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  workforce_request_id uuid references public.workforce_requests(id) on delete set null,
  full_name text not null,
  phone text not null,
  email text,
  applied_position text not null,
  source_channel text not null,
  status public.candidate_status not null default 'new',
  screening_result text,
  interview_date timestamptz,
  interview_result text,
  final_recommendation text,
  final_decision_by_user_id uuid references public.app_users(id),
  final_decision_at timestamptz,
  created_by_user_id uuid not null references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employee_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  candidate_id uuid references public.candidates(id) on delete set null,
  employee_code text not null,
  full_name text not null,
  position_title text not null,
  join_date date not null,
  employment_type text not null,
  employment_status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_apotek_id, employee_code)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  title text not null,
  task_type text not null,
  description text,
  related_entity_type text not null check (related_entity_type in ('workforce_request', 'candidate', 'employee')),
  related_entity_id uuid not null,
  assigned_to_user_id uuid not null references public.app_users(id),
  created_by_user_id uuid not null references public.app_users(id),
  due_date timestamptz not null,
  assigned_at timestamptz not null default now(),
  status public.task_status not null default 'open',
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_approvals (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  action public.task_approval_action not null,
  actor_user_id uuid not null references public.app_users(id),
  notes text,
  acted_at timestamptz not null default now()
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid references public.tenant_apotek(id) on delete cascade,
  actor_user_id uuid references public.app_users(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

-- =========================
-- Payroll v1 (phase included)
-- =========================
create table public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status public.payroll_status not null default 'draft',
  submitted_by_user_id uuid references public.app_users(id),
  submitted_at timestamptz,
  approved_by_user_id uuid references public.app_users(id),
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end >= period_start),
  unique (tenant_apotek_id, period_start, period_end)
);

create table public.payroll_items (
  id uuid primary key default gen_random_uuid(),
  payroll_period_id uuid not null references public.payroll_periods(id) on delete cascade,
  employee_profile_id uuid not null references public.employee_profiles(id),
  base_salary numeric(14,2) not null default 0 check (base_salary >= 0),
  allowance numeric(14,2) not null default 0 check (allowance >= 0),
  deduction numeric(14,2) not null default 0 check (deduction >= 0),
  net_salary numeric(14,2) generated always as (base_salary + allowance - deduction) stored,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payroll_period_id, employee_profile_id)
);

-- =========================
-- Notifications and exports
-- =========================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  recipient_user_id uuid not null references public.app_users(id) on delete cascade,
  event_type text not null,
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  requested_by_user_id uuid not null references public.app_users(id) on delete cascade,
  export_type text not null check (export_type in ('tasks', 'candidates', 'payroll')),
  format public.export_format not null default 'csv',
  status public.export_status not null default 'queued',
  filters jsonb not null default '{}'::jsonb,
  file_url text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- =========================
-- Indexes
-- =========================
create index idx_tenant_memberships_user on public.tenant_memberships(user_id);
create index idx_tenant_memberships_tenant on public.tenant_memberships(tenant_apotek_id);
create index idx_workforce_requests_tenant_status on public.workforce_requests(tenant_apotek_id, status);
create index idx_candidates_tenant_status on public.candidates(tenant_apotek_id, status);
create index idx_tasks_tenant_status on public.tasks(tenant_apotek_id, status);
create index idx_tasks_assignee on public.tasks(assigned_to_user_id);
create index idx_activity_logs_tenant_created_at on public.activity_logs(tenant_apotek_id, created_at desc);
create index idx_payroll_periods_tenant_status on public.payroll_periods(tenant_apotek_id, status);
create index idx_notifications_recipient_unread on public.notifications(recipient_user_id, is_read);
create index idx_export_jobs_tenant_status on public.export_jobs(tenant_apotek_id, status);

-- =========================
-- Utility functions
-- =========================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_member_of_tenant(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_apotek_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.is_active = true
  );
$$;

create or replace function public.has_tenant_role(target_tenant_id uuid, allowed_roles public.role_name[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships m
    where m.tenant_apotek_id = target_tenant_id
      and m.user_id = auth.uid()
      and m.is_active = true
      and m.role = any(allowed_roles)
  );
$$;

create or replace function public.share_tenant_with_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships mine
    join public.tenant_memberships theirs
      on theirs.tenant_apotek_id = mine.tenant_apotek_id
    where mine.user_id = auth.uid()
      and mine.is_active = true
      and theirs.user_id = target_user_id
      and theirs.is_active = true
  );
$$;

create or replace function public.enforce_task_approval_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_tenant_id uuid;
begin
  if new.actor_user_id <> auth.uid() then
    raise exception 'actor_user_id must match authenticated user';
  end if;

  select t.tenant_apotek_id into task_tenant_id
  from public.tasks t
  where t.id = new.task_id;

  if task_tenant_id is null then
    raise exception 'task not found';
  end if;

  if new.action = 'approved' and not public.has_tenant_role(task_tenant_id, array['super_admin_bba']::public.role_name[]) then
    raise exception 'final task approval requires super_admin_bba role';
  end if;

  if new.action in ('revision_required', 'rejected')
     and not public.has_tenant_role(task_tenant_id, array['super_admin_bba', 'admin_apotek']::public.role_name[]) then
    raise exception 'revision or rejection requires admin_apotek or super_admin_bba role';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_payroll_final_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    if not public.has_tenant_role(new.tenant_apotek_id, array['super_admin_bba']::public.role_name[]) then
      raise exception 'final payroll approval requires super_admin_bba role';
    end if;
    new.approved_by_user_id = auth.uid();
    new.approved_at = now();
  end if;

  if new.status = 'submitted' and old.status is distinct from new.status then
    new.submitted_by_user_id = auth.uid();
    new.submitted_at = now();
  end if;

  return new;
end;
$$;

create or replace function public.log_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tracked_status text;
begin
  if tg_table_name = 'workforce_requests' then
    tracked_status = new.status::text;
  elsif tg_table_name = 'candidates' then
    tracked_status = new.status::text;
  elsif tg_table_name = 'tasks' then
    tracked_status = new.status::text;
  else
    return new;
  end if;

  if old.status is distinct from new.status then
    insert into public.activity_logs (
      tenant_apotek_id,
      actor_user_id,
      entity_type,
      entity_id,
      action,
      old_value,
      new_value
    ) values (
      new.tenant_apotek_id,
      auth.uid(),
      tg_table_name,
      new.id,
      'status_changed',
      jsonb_build_object('status', old.status::text),
      jsonb_build_object('status', tracked_status)
    );
  end if;

  return new;
end;
$$;

-- =========================
-- Triggers
-- =========================
create trigger trg_tenant_apotek_updated_at
before update on public.tenant_apotek
for each row execute function public.set_updated_at();

create trigger trg_app_users_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

create trigger trg_workforce_requests_updated_at
before update on public.workforce_requests
for each row execute function public.set_updated_at();

create trigger trg_candidates_updated_at
before update on public.candidates
for each row execute function public.set_updated_at();

create trigger trg_employee_profiles_updated_at
before update on public.employee_profiles
for each row execute function public.set_updated_at();

create trigger trg_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create trigger trg_payroll_periods_updated_at
before update on public.payroll_periods
for each row execute function public.set_updated_at();

create trigger trg_payroll_items_updated_at
before update on public.payroll_items
for each row execute function public.set_updated_at();

create trigger trg_task_approvals_enforce_actor
before insert on public.task_approvals
for each row execute function public.enforce_task_approval_actor();

create trigger trg_payroll_periods_enforce_final_approval
before update on public.payroll_periods
for each row execute function public.enforce_payroll_final_approval();

create trigger trg_log_workforce_request_status_change
after update on public.workforce_requests
for each row execute function public.log_status_change();

create trigger trg_log_candidate_status_change
after update on public.candidates
for each row execute function public.log_status_change();

create trigger trg_log_task_status_change
after update on public.tasks
for each row execute function public.log_status_change();

-- =========================
-- Row Level Security
-- =========================
alter table public.tenant_apotek enable row level security;
alter table public.app_users enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.workforce_requests enable row level security;
alter table public.candidates enable row level security;
alter table public.employee_profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_approvals enable row level security;
alter table public.activity_logs enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.payroll_items enable row level security;
alter table public.notifications enable row level security;
alter table public.export_jobs enable row level security;

-- Tenant table policies
create policy tenant_select
on public.tenant_apotek
for select
to authenticated
using (public.is_member_of_tenant(id));

create policy tenant_update_by_super_admin
on public.tenant_apotek
for update
to authenticated
using (public.has_tenant_role(id, array['super_admin_bba']::public.role_name[]))
with check (public.has_tenant_role(id, array['super_admin_bba']::public.role_name[]));

-- User table policies
create policy app_users_select_self_or_shared_tenant
on public.app_users
for select
to authenticated
using (id = auth.uid() or public.share_tenant_with_user(id));

create policy app_users_update_self
on public.app_users
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Membership policies
create policy memberships_select_self_or_super_admin
on public.tenant_memberships
for select
to authenticated
using (
  user_id = auth.uid()
  or public.has_tenant_role(tenant_apotek_id, array['super_admin_bba']::public.role_name[])
);

create policy memberships_manage_by_super_admin
on public.tenant_memberships
for all
to authenticated
using (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba']::public.role_name[]))
with check (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba']::public.role_name[]));

-- Workforce requests
create policy wr_select_members
on public.workforce_requests
for select
to authenticated
using (public.is_member_of_tenant(tenant_apotek_id));

create policy wr_insert_ops_roles
on public.workforce_requests
for insert
to authenticated
with check (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba', 'admin_apotek', 'crew']::public.role_name[]));

create policy wr_update_ops_roles
on public.workforce_requests
for update
to authenticated
using (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba', 'admin_apotek', 'crew']::public.role_name[]))
with check (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba', 'admin_apotek', 'crew']::public.role_name[]));

-- Candidates
create policy candidate_select_members
on public.candidates
for select
to authenticated
using (public.is_member_of_tenant(tenant_apotek_id));

create policy candidate_insert_ops_roles
on public.candidates
for insert
to authenticated
with check (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba', 'admin_apotek', 'crew']::public.role_name[]));

create policy candidate_update_ops_roles
on public.candidates
for update
to authenticated
using (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba', 'admin_apotek', 'crew']::public.role_name[]))
with check (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba', 'admin_apotek', 'crew']::public.role_name[]));

-- Employee profiles
create policy employee_select_members
on public.employee_profiles
for select
to authenticated
using (public.is_member_of_tenant(tenant_apotek_id));

create policy employee_write_ops_roles
on public.employee_profiles
for all
to authenticated
using (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba', 'admin_apotek', 'crew']::public.role_name[]))
with check (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba', 'admin_apotek', 'crew']::public.role_name[]));

-- Tasks
create policy task_select_members
on public.tasks
for select
to authenticated
using (public.is_member_of_tenant(tenant_apotek_id));

create policy task_write_ops_roles
on public.tasks
for all
to authenticated
using (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba', 'admin_apotek', 'crew']::public.role_name[]))
with check (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba', 'admin_apotek', 'crew']::public.role_name[]));

-- Task approvals
create policy task_approvals_select_members
on public.task_approvals
for select
to authenticated
using (
  exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and public.is_member_of_tenant(t.tenant_apotek_id)
  )
);

create policy task_approvals_insert_reviewer_roles
on public.task_approvals
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tasks t
    where t.id = task_id
      and public.has_tenant_role(t.tenant_apotek_id, array['super_admin_bba', 'admin_apotek']::public.role_name[])
  )
);

-- Activity logs (read-only for non service role)
create policy activity_logs_select_members
on public.activity_logs
for select
to authenticated
using (tenant_apotek_id is null or public.is_member_of_tenant(tenant_apotek_id));

-- Payroll periods
create policy payroll_periods_select_members
on public.payroll_periods
for select
to authenticated
using (public.is_member_of_tenant(tenant_apotek_id));

create policy payroll_periods_write_ops_roles
on public.payroll_periods
for all
to authenticated
using (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba', 'admin_apotek']::public.role_name[]))
with check (public.has_tenant_role(tenant_apotek_id, array['super_admin_bba', 'admin_apotek']::public.role_name[]));

-- Payroll items
create policy payroll_items_select_members
on public.payroll_items
for select
to authenticated
using (
  exists (
    select 1
    from public.payroll_periods p
    where p.id = payroll_period_id
      and public.is_member_of_tenant(p.tenant_apotek_id)
  )
);

create policy payroll_items_write_ops_roles
on public.payroll_items
for all
to authenticated
using (
  exists (
    select 1
    from public.payroll_periods p
    where p.id = payroll_period_id
      and public.has_tenant_role(p.tenant_apotek_id, array['super_admin_bba', 'admin_apotek']::public.role_name[])
  )
)
with check (
  exists (
    select 1
    from public.payroll_periods p
    where p.id = payroll_period_id
      and public.has_tenant_role(p.tenant_apotek_id, array['super_admin_bba', 'admin_apotek']::public.role_name[])
  )
);

-- Notifications
create policy notifications_select_recipient_or_super_admin
on public.notifications
for select
to authenticated
using (
  recipient_user_id = auth.uid()
  or public.has_tenant_role(tenant_apotek_id, array['super_admin_bba']::public.role_name[])
);

create policy notifications_update_recipient
on public.notifications
for update
to authenticated
using (recipient_user_id = auth.uid())
with check (recipient_user_id = auth.uid());

create policy notifications_insert_ops_roles
on public.notifications
for insert
to authenticated
with check (
  public.has_tenant_role(tenant_apotek_id, array['super_admin_bba', 'admin_apotek']::public.role_name[])
);

-- Export jobs
create policy export_jobs_select_members
on public.export_jobs
for select
to authenticated
using (public.is_member_of_tenant(tenant_apotek_id));

create policy export_jobs_insert_ops_or_owner
on public.export_jobs
for insert
to authenticated
with check (
  public.has_tenant_role(tenant_apotek_id, array['super_admin_bba', 'admin_apotek', 'owner']::public.role_name[])
);

create policy export_jobs_update_super_admin
on public.export_jobs
for update
to authenticated
using (
  public.has_tenant_role(tenant_apotek_id, array['super_admin_bba']::public.role_name[])
)
with check (
  public.has_tenant_role(tenant_apotek_id, array['super_admin_bba']::public.role_name[])
);
