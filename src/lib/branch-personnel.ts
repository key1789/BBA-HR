/**
 * Pegawai operasional (headcount, payroll, KPI per orang, dll.):
 * crew + admin apotek yang BUKAN akun meja cabang.
 */
export function isBranchOperationalPersonnel(user: {
  role: string;
  app_users?: { is_branch_desk_account?: boolean | null } | null;
}): boolean {
  if (user.role === "crew") return true;
  if (user.role === "admin_apotek") {
    return !user.app_users?.is_branch_desk_account;
  }
  return false;
}

export function isBranchDeskAdminAccount(user: {
  role: string;
  app_users?: { is_branch_desk_account?: boolean | null } | null;
}): boolean {
  return user.role === "admin_apotek" && !!user.app_users?.is_branch_desk_account;
}
