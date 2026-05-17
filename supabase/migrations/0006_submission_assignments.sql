-- V1.1 operational speed: assignment for verification queue
create table public.submission_assignments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references public.daily_submissions(id) on delete cascade,
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  assigned_to_user_id uuid not null references public.app_users(id),
  assigned_by_user_id uuid not null references public.app_users(id),
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_submission_assignments_tenant_assignee
  on public.submission_assignments (tenant_apotek_id, assigned_to_user_id, assigned_at desc);

create trigger trg_submission_assignments_updated_at
before update on public.submission_assignments
for each row execute function public.set_updated_at();

alter table public.submission_assignments enable row level security;

create policy "Submission assignments readable by admins"
on public.submission_assignments
for select
using (
  public.has_tenant_role(
    tenant_apotek_id,
    array['super_admin_bba', 'admin_apotek']::public.role_name[]
  )
);

create policy "Submission assignments insert by admins"
on public.submission_assignments
for insert
with check (
  public.has_tenant_role(
    tenant_apotek_id,
    array['super_admin_bba', 'admin_apotek']::public.role_name[]
  )
);

create policy "Submission assignments update by admins"
on public.submission_assignments
for update
using (
  public.has_tenant_role(
    tenant_apotek_id,
    array['super_admin_bba', 'admin_apotek']::public.role_name[]
  )
)
with check (
  public.has_tenant_role(
    tenant_apotek_id,
    array['super_admin_bba', 'admin_apotek']::public.role_name[]
  )
);
