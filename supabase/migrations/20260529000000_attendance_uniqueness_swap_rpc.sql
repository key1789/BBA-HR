-- 1. Unique index: satu clock-in per user per hari (timezone Asia/Jakarta)
--    Mencegah race condition dua request bersamaan meloloskan pengecekan duplikat.
create unique index attendance_logs_one_per_day
  on public.attendance_logs (
    tenant_apotek_id,
    user_id,
    ((clock_in_time at time zone 'Asia/Jakarta')::date)
  );

-- 2. RPC: approve_shift_swap
--    Ketiga update (jadwal requester, jadwal target, status swap) berjalan dalam
--    satu transaksi database sehingga tidak ada state inkonsisten jika salah satu gagal.
create or replace function public.approve_shift_swap(
  p_swap_request_id     uuid,
  p_tenant_apotek_id    uuid,
  p_requester_schedule_id uuid,
  p_target_schedule_id  uuid,
  p_req_shift_id        uuid,
  p_req_is_off          boolean,
  p_tgt_shift_id        uuid,
  p_tgt_is_off          boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Update jadwal requester dengan data shift target
  update public.shift_schedules
  set shift_id   = p_req_shift_id,
      is_off     = p_req_is_off,
      updated_at = now()
  where id               = p_requester_schedule_id
    and tenant_apotek_id = p_tenant_apotek_id;

  if not found then
    raise exception 'requester schedule not found';
  end if;

  -- Update jadwal target dengan data shift requester
  update public.shift_schedules
  set shift_id   = p_tgt_shift_id,
      is_off     = p_tgt_is_off,
      updated_at = now()
  where id               = p_target_schedule_id
    and tenant_apotek_id = p_tenant_apotek_id;

  if not found then
    raise exception 'target schedule not found';
  end if;

  -- Set status swap menjadi approved
  update public.shift_swap_requests
  set status     = 'approved',
      updated_at = now()
  where id               = p_swap_request_id
    and tenant_apotek_id = p_tenant_apotek_id
    and status           in ('pending_crew', 'pending_admin');

  if not found then
    raise exception 'swap request not found or already processed';
  end if;
end;
$$;
