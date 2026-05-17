export type AdminStaffRowVm = {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  is_global_admin: boolean;
  bba_portal_staff_role: string | null;
  kind: "global" | "analyst" | "legacy";
  analystTenantIds: string[];
  portalMenuKeys: string[];
  legacyPermissionLabels: string[];
  branchNames: string[];
  memberships: unknown[];
  canDemoteGlobal: boolean;
};
