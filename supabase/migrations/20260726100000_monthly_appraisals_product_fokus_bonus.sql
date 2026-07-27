-- Bonus produk fokus kini punya SUMBER KEBENARAN di server (dihitung saat sync/finalize),
-- bukan hanya hasil hitung browser yang dipercaya mentah oleh payroll.
alter table public.monthly_appraisals
  add column if not exists product_fokus_bonus numeric not null default 0;

comment on column public.monthly_appraisals.product_fokus_bonus is
  'Bonus produk fokus otomatis per crew per periode, dihitung server saat sync/finalize (productFokusEarnedForConfig). Sumber kebenaran untuk payroll/rapor.';
