-- Migration: 0016_staff_invitations.sql
-- Description: Add invitation flow for branch staff onboarding.

CREATE TABLE IF NOT EXISTS public.staff_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_apotek_id UUID NOT NULL REFERENCES public.tenant_apotek(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role public.role_name NOT NULL,
    token TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    invited_by_user_id UUID REFERENCES public.app_users(id),
    accepted_by_user_id UUID REFERENCES public.app_users(id),
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT staff_invitations_role_check CHECK (role IN ('crew', 'admin_apotek')),
    CONSTRAINT staff_invitations_status_check CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_staff_invitations_tenant ON public.staff_invitations(tenant_apotek_id);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_status ON public.staff_invitations(status);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_email ON public.staff_invitations(email);

ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin can manage staff invitations" ON public.staff_invitations
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.tenant_memberships
            WHERE user_id = auth.uid() AND role = 'super_admin_bba'
        )
    );
