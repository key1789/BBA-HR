-- Produk Fokus: dukung 5 skema bonus (target minimal opsional + basis hitung kelipatan).
-- has_min_target: true = pakai target (gerbang = target_value); false = tanpa target (gerbang = 1).
-- count_base    : hanya relevan untuk bonus_type 'kelipatan'.
--                 'excess' = bayar hanya kelebihan di atas target (Rasa A, perilaku lama).
--                 'full'   = bayar semua unit dari ke-1 begitu gerbang tercapai (Rasa B).
-- Data lama otomatis: has_min_target = true, count_base = 'excess' -> perilaku tidak berubah.

alter table public.product_fokus_configs
  add column if not exists has_min_target boolean not null default true,
  add column if not exists count_base text not null default 'excess';

alter table public.product_fokus_configs
  drop constraint if exists product_fokus_configs_count_base_check;

alter table public.product_fokus_configs
  add constraint product_fokus_configs_count_base_check
  check (count_base in ('excess', 'full'));

comment on column public.product_fokus_configs.has_min_target is
  'true = pakai target minimal (gerbang = target_value); false = tanpa target (gerbang = 1).';
comment on column public.product_fokus_configs.count_base is
  'Basis hitung kelipatan: excess = hanya kelebihan di atas target (Rasa A); full = semua unit dari ke-1 setelah gerbang tercapai (Rasa B).';
