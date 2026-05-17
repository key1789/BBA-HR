-- Tambah kolom alasan keterlambatan pada tabel daily_submissions
alter table public.daily_submissions 
add column late_reason text;

-- Buat tabel untuk menyimpan detail produk fokus yang diinput harian
create table public.daily_submission_products (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  submission_id uuid not null references public.daily_submissions(id) on delete cascade,
  product_id uuid not null references public.master_products(id),
  quantity_sold int not null default 0 check (quantity_sold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(submission_id, product_id)
);

create index idx_daily_submission_products_submission 
  on public.daily_submission_products(submission_id);

create trigger trg_daily_submission_products_updated_at
before update on public.daily_submission_products
for each row execute function public.set_updated_at();

alter table public.daily_submission_products enable row level security;

create policy dsp_select_members
on public.daily_submission_products
for select to authenticated
using (public.is_member_of_tenant(tenant_apotek_id));

create policy dsp_insert_crew_admin
on public.daily_submission_products
for insert to authenticated
with check (public.has_tenant_role(tenant_apotek_id, array['crew', 'admin_apotek', 'super_admin_bba']::public.role_name[]));

create policy dsp_update_creator_or_admin
on public.daily_submission_products
for update to authenticated
using (
  exists (
    select 1 from public.daily_submissions s
    where s.id = submission_id and (
      s.user_id = auth.uid()
      or public.has_tenant_role(tenant_apotek_id, array['admin_apotek', 'super_admin_bba']::public.role_name[])
    )
  )
)
with check (
  exists (
    select 1 from public.daily_submissions s
    where s.id = submission_id and (
      s.user_id = auth.uid()
      or public.has_tenant_role(tenant_apotek_id, array['admin_apotek', 'super_admin_bba']::public.role_name[])
    )
  )
);

create policy dsp_delete_creator_or_admin
on public.daily_submission_products
for delete to authenticated
using (
  exists (
    select 1 from public.daily_submissions s
    where s.id = submission_id and (
      s.user_id = auth.uid()
      or public.has_tenant_role(tenant_apotek_id, array['admin_apotek', 'super_admin_bba']::public.role_name[])
    )
  )
);
