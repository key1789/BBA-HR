-- Migration: 0017_staff_password_reset_links.sql
-- Description: Token-based password reset links for staff (admin-assisted flow).

CREATE TABLE IF NOT EXISTS public.staff_password_reset_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
    tenant_apotek_id UUID NOT NULL REFERENCES public.tenant_apotek(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ NOT NULL,
    created_by_user_id UUID REFERENCES public.app_users(id),
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT staff_password_reset_links_status_check CHECK (status IN ('pending', 'used', 'expired', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_staff_password_reset_links_user ON public.staff_password_reset_links(user_id);
CREATE INDEX IF NOT EXISTS idx_staff_password_reset_links_status ON public.staff_password_reset_links(status);

ALTER TABLE public.staff_password_reset_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super Admin can manage staff password reset links" ON public.staff_password_reset_links
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.tenant_memberships
            WHERE user_id = auth.uid() AND role = 'super_admin_bba'
        )
    );
