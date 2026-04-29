-- Allow authenticated tenant members to write activity logs.
-- This enables app-level audit events for verification, export, and payroll lock/unlock.

create policy activity_logs_insert_members
on public.activity_logs
for insert
to authenticated
with check (
  tenant_apotek_id is null
  or public.is_member_of_tenant(tenant_apotek_id)
);
