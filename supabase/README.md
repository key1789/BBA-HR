# Supabase Database Blueprint (v1)

This folder contains the initial SQL blueprint for BBA HR:

- `migrations/0001_initial_schema.sql`
- `migrations/0002_v1_core_operational.sql`
- `migrations/0003_activity_log_insert_policy.sql`
- `migrations/0004_payroll_status_alignment.sql`

## What is included

- Multi-tenant model (`tenant_apotek`, `tenant_memberships`)
- Role model (`super_admin_bba`, `crew`, `admin_apotek`, `owner`)
- Core HR workflow tables (`workforce_requests`, `candidates`, `employee_profiles`, `tasks`, `task_approvals`)
- Payroll v1 (`payroll_periods`, `payroll_items`)
- Core operational V1 tables:
  - `kpi_configs`
  - `addon_settings`
  - `daily_submissions`
  - `submission_verifications`
  - `minus_points`
  - `leaderboard_snapshots`
- In-app notifications (`notifications`)
- Export queue (`export_jobs`)
- Activity log (`activity_logs`)
- RLS policy baseline for tenant isolation and role-based access
- Approval guard:
  - Final task approval must be `super_admin_bba`
  - Final payroll approval must be `super_admin_bba`
- SLA start point support via `tasks.assigned_at`

## How to apply in Supabase

1. Open Supabase SQL Editor.
2. Run `migrations/0001_initial_schema.sql`.
3. Run `migrations/0002_v1_core_operational.sql`.
4. Run `migrations/0003_activity_log_insert_policy.sql`.
5. Run `migrations/0004_payroll_status_alignment.sql`.
6. Create initial seed manually:
   - at least one tenant
   - one super admin membership for that tenant
4. Validate RLS using at least 3 users (super admin, admin apotek, crew/owner).

## Notes

- This is a baseline schema before app-level implementation.
- Payroll for V1 is built with hidden-release strategy (feature exposure controlled at app layer).
- For production hardening, add:
  - migration pipeline
  - seed scripts
  - alerting/monitoring for failed exports and approval exceptions
