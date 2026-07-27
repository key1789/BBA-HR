-- Pola mingguan PER-HARI: satu baris per (crew, weekday) agar mendukung ROTASI shift
-- (crew bisa shift berbeda tiap hari) + OFF eksplisit. Menggantikan model lama
-- (1 baris/crew: shift tunggal + working_weekdays[]).

ALTER TABLE public.crew_shift_defaults
  ADD COLUMN IF NOT EXISTS weekday int,
  ADD COLUMN IF NOT EXISTS is_off boolean NOT NULL DEFAULT false;

-- shift_id boleh NULL untuk baris OFF.
ALTER TABLE public.crew_shift_defaults ALTER COLUMN shift_id DROP NOT NULL;

-- Lepas unik lama (tenant,user) agar boleh banyak baris per crew.
ALTER TABLE public.crew_shift_defaults
  DROP CONSTRAINT IF EXISTS crew_shift_defaults_tenant_apotek_id_user_id_key;

-- Expand baris lama (1 shift × working_weekdays) → satu baris per weekday.
INSERT INTO public.crew_shift_defaults (tenant_apotek_id, user_id, shift_id, weekday, is_off, updated_at)
SELECT tenant_apotek_id, user_id, shift_id, wd, false, now()
FROM public.crew_shift_defaults, unnest(working_weekdays) AS wd
WHERE weekday IS NULL AND working_weekdays IS NOT NULL AND array_length(working_weekdays, 1) > 0;

DELETE FROM public.crew_shift_defaults WHERE weekday IS NULL;

ALTER TABLE public.crew_shift_defaults DROP COLUMN IF EXISTS working_weekdays;

ALTER TABLE public.crew_shift_defaults ALTER COLUMN weekday SET NOT NULL;

ALTER TABLE public.crew_shift_defaults
  ADD CONSTRAINT crew_shift_defaults_weekday_range CHECK (weekday BETWEEN 0 AND 6);

-- Integritas: baris shift (shift_id ada, tak OFF) ATAU baris OFF (shift_id NULL).
ALTER TABLE public.crew_shift_defaults
  ADD CONSTRAINT crew_shift_defaults_shift_or_off
  CHECK ((is_off AND shift_id IS NULL) OR (NOT is_off AND shift_id IS NOT NULL));

ALTER TABLE public.crew_shift_defaults
  ADD CONSTRAINT crew_shift_defaults_tenant_user_weekday_key UNIQUE (tenant_apotek_id, user_id, weekday);
