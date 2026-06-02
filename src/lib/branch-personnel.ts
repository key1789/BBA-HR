/**
 * Pegawai operasional (headcount, payroll, KPI per orang, dll.):
 * hanya crew — admin apotek adalah shared desk account, ditampilkan di tab tersendiri.
 */
export function isBranchOperationalPersonnel(user: {
  role: string;
  app_users?: { is_branch_desk_account?: boolean | null } | null;
}): boolean {
  return user.role === "crew";
}

export function isBranchDeskAdminAccount(user: {
  role: string;
  app_users?: { is_branch_desk_account?: boolean | null } | null;
}): boolean {
  return user.role === "admin_apotek" && !!user.app_users?.is_branch_desk_account;
}
