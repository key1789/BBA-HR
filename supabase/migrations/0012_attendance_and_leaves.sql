-- 0012_attendance_and_leaves.sql

-- 1. Create Storage Bucket
insert into storage.buckets (id, name, public) 
values ('hr_files', 'hr_files', true) 
on conflict (id) do nothing;

create policy "Public Access" on storage.objects for select using ( bucket_id = 'hr_files' );
create policy "Auth Insert" on storage.objects for insert to authenticated with check ( bucket_id = 'hr_files' );
create policy "Auth Update" on storage.objects for update to authenticated using ( bucket_id = 'hr_files' );

-- 2. attendance_logs
create table public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  user_id uuid not null references public.app_users(id),
  shift_schedule_id uuid references public.shift_schedules(id) on delete set null,
  clock_in_time timestamptz not null default now(),
  clock_out_time timestamptz,
  photo_url text not null,
  is_late boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. leave_requests
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  user_id uuid not null references public.app_users(id),
  leave_type text not null check (leave_type in ('sakit', 'cuti_tahunan', 'izin_lainnya')),
  start_date date not null,
  end_date date not null,
  reason text not null,
  attachment_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. shift_swap_requests
create table public.shift_swap_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  requester_user_id uuid not null references public.app_users(id),
  requester_schedule_id uuid not null references public.shift_schedules(id) on delete cascade,
  target_user_id uuid not null references public.app_users(id),
  target_schedule_id uuid references public.shift_schedules(id) on delete cascade,
  reason text not null,
  status text not null default 'pending_crew' check (status in ('pending_crew', 'pending_admin', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indices
create index idx_attendance_logs_tenant_user on public.attendance_logs(tenant_apotek_id, user_id);
create index idx_leave_requests_tenant_user on public.leave_requests(tenant_apotek_id, user_id);
create index idx_shift_swaps_tenant on public.shift_swap_requests(tenant_apotek_id);

-- Updated_at Triggers
create trigger trg_attendance_logs_updated_at before update on public.attendance_logs for each row execute function public.set_updated_at();
create trigger trg_leave_requests_updated_at before update on public.leave_requests for each row execute function public.set_updated_at();
create trigger trg_shift_swaps_updated_at before update on public.shift_swap_requests for each row execute function public.set_updated_at();

-- RLS
alter table public.attendance_logs enable row level security;
alter table public.leave_requests enable row level security;
alter table public.shift_swap_requests enable row level security;

-- RLS Policies (simplified for crew/admin)
create policy att_select on public.attendance_logs for select to authenticated using (public.is_member_of_tenant(tenant_apotek_id));
create policy att_insert on public.attendance_logs for insert to authenticated with check (public.has_tenant_role(tenant_apotek_id, array['crew', 'admin_apotek', 'super_admin_bba']::public.role_name[]));
create policy att_update on public.attendance_logs for update to authenticated using (public.has_tenant_role(tenant_apotek_id, array['admin_apotek', 'super_admin_bba']::public.role_name[]) or user_id = auth.uid());

create policy lvr_select on public.leave_requests for select to authenticated using (public.is_member_of_tenant(tenant_apotek_id));
create policy lvr_insert on public.leave_requests for insert to authenticated with check (public.has_tenant_role(tenant_apotek_id, array['crew', 'admin_apotek', 'super_admin_bba']::public.role_name[]));
create policy lvr_update on public.leave_requests for update to authenticated using (public.has_tenant_role(tenant_apotek_id, array['admin_apotek', 'super_admin_bba']::public.role_name[]) or user_id = auth.uid());

create policy ssr_select on public.shift_swap_requests for select to authenticated using (public.is_member_of_tenant(tenant_apotek_id));
create policy ssr_insert on public.shift_swap_requests for insert to authenticated with check (public.has_tenant_role(tenant_apotek_id, array['crew', 'admin_apotek', 'super_admin_bba']::public.role_name[]));
create policy ssr_update on public.shift_swap_requests for update to authenticated using (public.has_tenant_role(tenant_apotek_id, array['admin_apotek', 'super_admin_bba']::public.role_name[]) or requester_user_id = auth.uid() or target_user_id = auth.uid());
