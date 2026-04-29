-- Align payroll_status enum with PRD V1 payroll flow.
-- Keep legacy values for backward compatibility, add missing workflow states.

alter type public.payroll_status add value if not exists 'draft_bba';
alter type public.payroll_status add value if not exists 'sent_to_owner';
alter type public.payroll_status add value if not exists 'revision_requested_by_owner';
alter type public.payroll_status add value if not exists 'revised_by_bba';
alter type public.payroll_status add value if not exists 'approved_by_owner';
alter type public.payroll_status add value if not exists 'locked';
alter type public.payroll_status add value if not exists 'unlocked_by_bba_admin';

-- Optional mapping from legacy statuses to PRD-oriented statuses.
update public.payroll_periods
set status = 'draft_bba'
where status = 'draft';

update public.payroll_periods
set status = 'sent_to_owner'
where status = 'submitted';

update public.payroll_periods
set status = 'approved_by_owner'
where status = 'approved';
