-- 0013_peer_reviews.sql

create table public.peer_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_apotek_id uuid not null references public.tenant_apotek(id) on delete cascade,
  reviewer_user_id uuid not null references public.app_users(id) on delete cascade,
  reviewee_user_id uuid not null references public.app_users(id) on delete cascade,
  period_month int not null check (period_month between 1 and 12),
  period_year int not null check (period_year >= 2000),
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (reviewer_user_id, reviewee_user_id, period_month, period_year)
);

-- RLS
alter table public.peer_reviews enable row level security;

create policy peer_reviews_select_members
on public.peer_reviews
for select to authenticated
using (public.is_member_of_tenant(tenant_apotek_id));

create policy peer_reviews_insert_members
on public.peer_reviews
for insert to authenticated
with check (
  reviewer_user_id = auth.uid() 
  and public.is_member_of_tenant(tenant_apotek_id)
);

-- Index
create index idx_peer_reviews_reviewer on public.peer_reviews(reviewer_user_id, period_year, period_month);
create index idx_peer_reviews_tenant_period on public.peer_reviews(tenant_apotek_id, period_year, period_month);

-- Updated_at Trigger
create trigger trg_peer_reviews_updated_at
before update on public.peer_reviews
for each row execute function public.set_updated_at();
