-- 20260530100000_performance_indexes.sql
-- Tambah index performa untuk query yang sering digunakan di admin portal.
-- Semua menggunakan IF NOT EXISTS agar aman dijalankan ulang.

-- leave_requests: admin layout menghitung pending per tenant
-- (idx_leave_requests_tenant_user di migration 0012 hanya cover (tenant, user),
--  tidak optimal untuk filter by status tanpa user_id)
create index if not exists idx_leave_requests_tenant_status
  on public.leave_requests(tenant_apotek_id, status);

-- shift_swap_requests: admin layout menghitung pending_crew + pending_admin per tenant
-- (idx_shift_swaps_tenant di migration 0012 hanya satu kolom, status tidak ter-cover)
create index if not exists idx_shift_swaps_tenant_status
  on public.shift_swap_requests(tenant_apotek_id, status);

-- daily_submissions: query verifikasi selalu filter (tenant, status) + order by submission_date
create index if not exists idx_daily_submissions_tenant_status_date
  on public.daily_submissions(tenant_apotek_id, status, submission_date desc);

-- Catatan: addon_settings sudah punya UNIQUE(tenant_apotek_id, addon_key)
-- yang otomatis membuat index — tidak perlu index terpisah.
