-- Migration: 0015_deprecate_impersonation_logs.sql
-- Description: Deprecate unused impersonation logs table and related policies

-- Drop policies first to avoid dependency issues.
DROP POLICY IF EXISTS "Super Admin can view impersonation logs" ON public.impersonation_logs;
DROP POLICY IF EXISTS "Super Admin can insert impersonation logs" ON public.impersonation_logs;

-- Drop the table if it still exists.
DROP TABLE IF EXISTS public.impersonation_logs;
