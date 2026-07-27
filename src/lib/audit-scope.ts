/**
 * SATU sumber tenant-scope untuk akses/mutasi audit (/sa/audit).
 *
 * Analyst hanya boleh cabang yang di-assign (punya membership `super_admin_bba`
 * untuk tenant tsb). Staf Apotrik penuh (bukan analyst) & global super admin =
 * semua cabang. Dipakai oleh server actions audit (mutasi) DAN halaman view
 * (page.tsx → notFound), agar keputusan scope tak divergen.
 *
 * Return pesan error (string) bila ditolak, atau `null` bila boleh.
 */
export type AuditScopeSession = {
  bbaPortalStaffRole?: string | null;
  memberships?: { tenantId: string; role: string }[] | null;
} | null;

export function auditTenantScopeError(
  session: AuditScopeSession,
  tenantApotekId: string,
): string | null {
  if (session?.bbaPortalStaffRole === "analyst") {
    const assigned = new Set(
      (session.memberships ?? [])
        .filter((m) => m.role === "super_admin_bba")
        .map((m) => m.tenantId),
    );
    if (!assigned.has(tenantApotekId)) return "Anda tidak berwenang atas cabang ini.";
  }
  return null;
}
