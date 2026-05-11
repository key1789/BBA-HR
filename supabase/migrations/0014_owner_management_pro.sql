-- Migration: 0014_owner_management_pro.sql
-- Description: Tables and columns for Owner Invitation, Impersonation Logs, and Activity Tracking

-- 1. Add last_login_at to app_users
ALTER TABLE public.app_users 
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- 2. Create owner_invitations table
CREATE TABLE IF NOT EXISTS public.owner_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    token TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'expired'
    expires_at TIMESTAMPTZ NOT NULL,
    created_by_user_id UUID REFERENCES public.app_users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Create impersonation_logs table
CREATE TABLE IF NOT EXISTS public.impersonation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID REFERENCES public.app_users(id),
    target_user_id UUID REFERENCES public.app_users(id),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Enable RLS
ALTER TABLE public.owner_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impersonation_logs ENABLE ROW LEVEL SECURITY;

-- 5. Policies (Only Super Admin can manage these)
CREATE POLICY "Super Admin can manage invitations" ON public.owner_invitations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.tenant_memberships 
            WHERE user_id = auth.uid() AND role = 'super_admin_bba'
        )
    );

CREATE POLICY "Super Admin can view impersonation logs" ON public.impersonation_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.tenant_memberships 
            WHERE user_id = auth.uid() AND role = 'super_admin_bba'
        )
    );

CREATE POLICY "Super Admin can insert impersonation logs" ON public.impersonation_logs
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.tenant_memberships 
            WHERE user_id = auth.uid() AND role = 'super_admin_bba'
        )
    );
