-- Cegah produk master dobel (dari input manual maupun import Excel).
-- Unik case-insensitive + abaikan spasi tepi: lower(btrim(product_name)).
create unique index if not exists master_products_name_ci_unique
  on public.master_products (lower(btrim(product_name)));
