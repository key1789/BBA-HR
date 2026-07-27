-- Backfill schema drift: 8 tabel berikut ADA di DB produksi tapi TIDAK PERNAH
-- dibuat lewat migrasi `create table` (dibuat out-of-band / prototipe lama).
-- Akibatnya `supabase db reset` / replay migrasi di environment baru TIDAK
-- membentuk tabel-tabel ini → schema hasil replay != DB nyata.
--
-- Migrasi ini merekonstruksi struktur + constraint + index + RLS + policy PERSIS
-- seperti DB nyata (diintrospeksi 2026-07-26). SEMUA statement idempoten
-- (IF NOT EXISTS / guarded DO-block), jadi ini NO-OP total di DB yang sudah ada
-- dan hanya berefek saat replay di environment kosong.
--
-- Urutan menghormati FK: master_products sebelum product_fokus_configs.
-- Fungsi is_member_of_tenant()/has_tenant_role() + enum role_name diasumsikan sudah
-- dibuat migrasi RLS-foundation lebih awal.
--
-- CATATAN KEAMANAN (direplikasi apa adanya, BUKAN diperbaiki di sini): policy
-- "Super admin can see all ..." pada crew_achievements/daily_achievements/
-- employee_salary_configs bersifat `for all to public using(true)` = permisif penuh.
-- Ketiganya tabel orphan (0 baris, tak dipakai kode) — dampak praktis nihil, tapi
-- layak ditinjau terpisah bila tabel dihidupkan kembali.

-- ── master_products (FK target untuk product_fokus_configs) ───────────────────
create table if not exists public.master_products (
  id           uuid primary key default gen_random_uuid(),
  product_name text not null,
  category     text,
  created_at   timestamptz default now(),
  is_active    boolean default true,
  updated_at   timestamptz
);
create unique index if not exists master_products_name_ci_unique
  on public.master_products (lower(btrim(product_name)));

-- ── payroll_configs ──────────────────────────────────────────────────────────
create table if not exists public.payroll_configs (
  id                  uuid primary key default gen_random_uuid(),
  tenant_apotek_id    uuid not null references public.tenant_apotek(id) on delete cascade,
  user_id             uuid not null references public.app_users(id) on delete cascade,
  base_salary         numeric default 0,
  position_allowance  numeric default 0,
  meal_allowance      numeric default 0,
  transport_allowance numeric default 0,
  bpjs_deduction      numeric default 0,
  custom_adjustments  jsonb default '[]'::jsonb,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  constraint payroll_configs_tenant_apotek_id_user_id_key unique (tenant_apotek_id, user_id)
);

-- ── product_fokus_configs ────────────────────────────────────────────────────
create table if not exists public.product_fokus_configs (
  id               uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid references public.tenant_apotek(id) on delete cascade,
  product_id       uuid references public.master_products(id) on delete cascade,
  period_month     integer not null,
  period_year      integer not null,
  target_type      text not null,
  target_value     numeric not null,
  bonus_type       text not null,
  bonus_value      numeric not null,
  bonus_step       numeric,
  created_at       timestamptz default now(),
  has_min_target   boolean not null default true,
  count_base       text not null default 'excess' check (count_base = any (array['excess'::text, 'full'::text])),
  constraint product_fokus_configs_tenant_product_period_key unique (tenant_apotek_id, product_id, period_month, period_year)
);

-- ── shift_schedules ──────────────────────────────────────────────────────────
create table if not exists public.shift_schedules (
  id               uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid references public.tenant_apotek(id) on delete cascade,
  user_id          uuid references public.app_users(id) on delete cascade,
  shift_id         uuid references public.master_shifts(id) on delete set null,
  schedule_date    date not null,
  is_off           boolean default false,
  created_at       timestamptz default now(),
  constraint shift_schedules_tenant_user_date_key unique (tenant_apotek_id, user_id, schedule_date)
);

-- ── crew_achievements ────────────────────────────────────────────────────────
create table if not exists public.crew_achievements (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.app_users(id) on delete cascade,
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  achievement_date date not null,
  omzet            numeric default 0,
  transactions     integer default 0,
  items            integer default 0,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  constraint crew_achievements_user_id_achievement_date_key unique (user_id, achievement_date)
);

-- ── daily_achievements ───────────────────────────────────────────────────────
create table if not exists public.daily_achievements (
  id                 uuid primary key default gen_random_uuid(),
  tenant_apotek_id   uuid not null references public.tenant_apotek(id) on delete cascade,
  achievement_date   date not null,
  total_omzet        numeric default 0,
  total_transactions integer default 0,
  total_items        integer default 0,
  rejected_count     integer default 0,
  rejected_omzet_est numeric default 0,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  constraint daily_achievements_tenant_apotek_id_achievement_date_key unique (tenant_apotek_id, achievement_date)
);

-- ── customer_review_logs ─────────────────────────────────────────────────────
create table if not exists public.customer_review_logs (
  id                 uuid primary key default gen_random_uuid(),
  tenant_apotek_id   uuid not null references public.tenant_apotek(id) on delete cascade,
  reviewed_at        timestamptz not null default now(),
  customer_name      text,
  review_text        text not null,
  rating             integer check ((rating >= 1) and (rating <= 5)),
  tagged_user_id     uuid references public.app_users(id) on delete set null,
  created_by_user_id uuid not null references public.app_users(id),
  updated_by_user_id uuid references public.app_users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_customer_review_logs_tenant_date
  on public.customer_review_logs (tenant_apotek_id, reviewed_at desc);

-- ── employee_salary_configs ──────────────────────────────────────────────────
create table if not exists public.employee_salary_configs (
  id               uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid references public.tenant_apotek(id) on delete cascade,
  user_id          uuid references public.app_users(id) on delete cascade,
  period_month     integer not null,
  period_year      integer not null,
  base_salary      numeric not null,
  updated_at       timestamptz default now(),
  constraint employee_salary_configs_user_id_period_month_period_year_key unique (user_id, period_month, period_year)
);

-- ── RLS (idempoten) ──────────────────────────────────────────────────────────
alter table public.master_products         enable row level security;
alter table public.payroll_configs         enable row level security;
alter table public.product_fokus_configs   enable row level security;
alter table public.shift_schedules         enable row level security;
alter table public.crew_achievements       enable row level security;
alter table public.daily_achievements      enable row level security;
alter table public.customer_review_logs    enable row level security;
alter table public.employee_salary_configs enable row level security;

-- ── Policies (guarded: dibuat hanya bila belum ada → NO-OP di DB live) ────────
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='crew_achievements' and policyname='Super admin can see all crew achievements') then
    create policy "Super admin can see all crew achievements" on public.crew_achievements as permissive for all to public using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='daily_achievements' and policyname='Super admin can see all daily achievements') then
    create policy "Super admin can see all daily achievements" on public.daily_achievements as permissive for all to public using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='employee_salary_configs' and policyname='Super admin can see all salary configs') then
    create policy "Super admin can see all salary configs" on public.employee_salary_configs as permissive for all to public using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='product_fokus_configs' and policyname='product_fokus_configs_select_members') then
    create policy product_fokus_configs_select_members on public.product_fokus_configs as permissive for select to authenticated using (is_member_of_tenant(tenant_apotek_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='customer_review_logs' and policyname='customer_review_logs_insert_admin_super') then
    create policy customer_review_logs_insert_admin_super on public.customer_review_logs as permissive for insert to authenticated with check (has_tenant_role(tenant_apotek_id, ARRAY['admin_apotek'::role_name, 'super_admin_bba'::role_name]));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='customer_review_logs' and policyname='customer_review_logs_select_members') then
    create policy customer_review_logs_select_members on public.customer_review_logs as permissive for select to authenticated using (is_member_of_tenant(tenant_apotek_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='customer_review_logs' and policyname='customer_review_logs_update_admin_super') then
    create policy customer_review_logs_update_admin_super on public.customer_review_logs as permissive for update to authenticated using (has_tenant_role(tenant_apotek_id, ARRAY['admin_apotek'::role_name, 'super_admin_bba'::role_name])) with check (has_tenant_role(tenant_apotek_id, ARRAY['admin_apotek'::role_name, 'super_admin_bba'::role_name]));
  end if;
end $$;
