import test from "node:test";
import assert from "node:assert/strict";
import { auditTenantScopeError } from "@/lib/audit-scope";

// Cabang uji nyata di DB
const WARAS = "30903c6d-5fe8-4b1d-ac6a-a2bfc170b663";
const DEMO = "5a5c45f9-45e7-4653-a8f8-4d9e84e2d441";
const BLOCKED = "Anda tidak berwenang atas cabang ini.";

// Analyst uji: di-assign HANYA ke WARAS (membership super_admin_bba).
const analystWaras = {
  bbaPortalStaffRole: "analyst",
  memberships: [{ tenantId: WARAS, role: "super_admin_bba" }],
};

test("#1 analyst boleh mutasi audit cabang yang di-assign (WARAS)", () => {
  assert.equal(auditTenantScopeError(analystWaras, WARAS), null);
});

test("#1 analyst DITOLAK mutasi audit cabang lain (DEMO) — inti perbaikan", () => {
  assert.equal(auditTenantScopeError(analystWaras, DEMO), BLOCKED);
});

test("#1 analyst tanpa assignment → ditolak semua cabang", () => {
  assert.equal(
    auditTenantScopeError({ bbaPortalStaffRole: "analyst", memberships: [] }, WARAS),
    BLOCKED,
  );
});

test("#1 membership non-super_admin_bba tak dihitung sebagai assignment", () => {
  const analystViewer = {
    bbaPortalStaffRole: "analyst",
    memberships: [{ tenantId: DEMO, role: "viewer" }],
  };
  assert.equal(auditTenantScopeError(analystViewer, DEMO), BLOCKED);
});

test("#1 staf Apotrik penuh (bukan analyst) → semua cabang boleh", () => {
  const fullStaff = { bbaPortalStaffRole: null, memberships: [] };
  assert.equal(auditTenantScopeError(fullStaff, WARAS), null);
  assert.equal(auditTenantScopeError(fullStaff, DEMO), null);
});

test("#1 global admin (bukan analyst) → semua cabang boleh", () => {
  assert.equal(auditTenantScopeError({ bbaPortalStaffRole: null }, DEMO), null);
});

// Gate scope dipanggil SETELAH assertAuditMutationAccess (yang sudah tolak sesi
// null / non-super_admin_bba); di sini null bukan "analyst" → bukan urusan gate ini.
test("#1 session null → bukan analyst, gate scope lolos (auth ditangani lapisan lain)", () => {
  assert.equal(auditTenantScopeError(null, DEMO), null);
});
