-- Migration: Extend app_users and tenant_memberships for advanced Super Admin management

-- 1. Add global access flag to app_users
ALTER TABLE public.app_users 
ADD COLUMN IF NOT EXISTS is_global_admin BOOLEAN DEFAULT false;

-- 2. Add granular permissions to tenant_memberships (for restricted access)
ALTER TABLE public.tenant_memberships 
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{"kpi": true, "payroll": true, "audit": true, "users": true}'::jsonb;

-- 3. Update existing Super Admins to be Global by default for now (to avoid breaking things)
UPDATE public.app_users 
SET is_global_admin = true 
WHERE id IN (
    SELECT user_id FROM public.tenant_memberships WHERE role = 'super_admin_bba'
);
