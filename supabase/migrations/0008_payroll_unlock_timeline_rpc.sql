-- Payroll unlock timeline RPC (BBA governance)

create or replace function public.get_payroll_unlock_timeline(
  p_tenant_id uuid,
  p_period_id uuid default null,
  p_limit int default 20
)
returns table (
  id uuid,
  payroll_period_id uuid,
  event_type text,
  reason text,
  actor_user_id uuid,
  actor_full_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  safe_limit int := greatest(coalesce(p_limit, 20), 1);
begin
  if to_regclass('public.payroll_unlock_events') is null then
    raise exception
      'Prerequisite migration missing: run 0007_payroll_unlock_events.sql before 0008_payroll_unlock_timeline_rpc.sql';
  end if;

  return query
  execute $q$
    select
      e.id,
      e.payroll_period_id,
      e.event_type,
      e.reason,
      e.actor_user_id,
      coalesce(u.full_name, 'Tanpa nama') as actor_full_name,
      e.created_at
    from public.payroll_unlock_events e
    left join public.app_users u on u.id = e.actor_user_id
    where e.tenant_apotek_id = $1
      and ($2 is null or e.payroll_period_id = $2)
      and public.has_tenant_role(
        $1,
        array['super_admin_bba']::public.role_name[]
      )
    order by e.created_at desc
    limit $3
  $q$
  using p_tenant_id, p_period_id, safe_limit;
end;
$$;

grant execute on function public.get_payroll_unlock_timeline(uuid, uuid, int) to authenticated;
