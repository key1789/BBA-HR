"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth-context";
import { syncMonthlyAppraisalsForPeriod } from "@/lib/kpi-v2/sync-monthly-appraisals";
import { revalidatePath } from "next/cache";

const ALLOWED_ADDON_KEYS = ["absensi_shift", "review_internal", "review_pelanggan"] as const;
const MIN_ADDON_NOMINAL = -10_000_000;
const MAX_ADDON_NOMINAL = 10_000_000;
const ALLOWED_AUDIT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["APPROVED"],
  APPROVED: ["UNDER_REVIEW"],
};

function isAnalystWithoutAuditMenu(session: Awaited<ReturnType<typeof getSessionContext>> | null) {
  if (!session?.bbaPortalStaffRole || session.bbaPortalStaffRole !== "analyst") return false;
  if (session.isGlobalSuperAdmin) return false;
  return !session.bbaPortalMenuKeys?.includes("audit");
}

function canTransitionAuditState(from: string, to: string) {
  const allowed = ALLOWED_AUDIT_TRANSITIONS[from] ?? [];
  return allowed.includes(to);
}

async function assertAuditMutationAccess() {
  const session = await getSessionContext();
  if (isAnalystWithoutAuditMenu(session)) {
    console.warn("[auth] assertAuditMutationAccess denied: analyst without audit menu", {
      userId: session?.userId ?? null,
    });
    return { error: "Akses ditolak untuk modul audit." } as const;
  }
  if (session?.activeMembership?.role !== "super_admin_bba") {
    console.warn("[auth] assertAuditMutationAccess denied: insufficient role", {
      userId: session?.userId ?? null,
      role: session?.activeMembership?.role ?? null,
    });
    return { error: "Hanya super admin BBA yang dapat mengubah data audit." } as const;
  }
  return { session } as const;
}

async function assertNotPublishedPayrollPeriod(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  tenantApotekId: string,
  periodMonth: number,
  periodYear: number,
) {
  const { data: publishedRow, error } = await supabaseAdmin
    .from("monthly_appraisals")
    .select("id")
    .eq("tenant_apotek_id", tenantApotekId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear)
    .eq("is_published", true)
    .limit(1)
    .maybeSingle();
  if (error) {
    return { error: "Gagal memvalidasi status publish payroll." } as const;
  }
  if (publishedRow?.id) {
    return { error: "Periode payroll sudah dipublish, perubahan audit dibekukan." } as const;
  }
  return {} as const;
}

async function syncMonthlyAppraisalsForAuditPeriod(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  params: { auditId: string; actorUserId: string },
): Promise<{ error?: string }> {
  const { data: audit, error: auditReadErr } = await supabaseAdmin
    .from("monthly_audits")
    .select("id, tenant_apotek_id, period_month, period_year")
    .eq("id", params.auditId)
    .maybeSingle();

  if (auditReadErr || !audit) {
    return { error: "Record audit tidak ditemukan." };
  }

  const result = await syncMonthlyAppraisalsForPeriod(supabaseAdmin, {
    tenantApotekId: audit.tenant_apotek_id as string,
    periodMonth: Number(audit.period_month),
    periodYear: Number(audit.period_year),
    actorUserId: params.actorUserId,
    auditId: params.auditId,
    reason: "audit_finalize_sync",
    source: "monthly_audit_finalize",
    excludePublishedUsers: true,
  });

  if (result.error) {
    return { error: result.error };
  }
  return {};
}

async function revalidateAuditDetailForMonthlyAuditId(supabaseAdmin: ReturnType<typeof createAdminClient>, auditId: string) {
  const { data } = await supabaseAdmin.from("monthly_audits").select("tenant_apotek_id").eq("id", auditId).maybeSingle();
  if (data?.tenant_apotek_id) {
    revalidatePath(`/bba/audit/${data.tenant_apotek_id}`);
  }
}

async function logAuditStateEvent(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  event: {
    monthlyAuditId?: string | null;
    tenantApotekId: string;
    periodMonth: number;
    periodYear: number;
    action: string;
    actorUserId: string | null;
    targetUserId?: string | null;
    fromStatus?: string | null;
    toStatus?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await supabaseAdmin.from("monthly_audit_state_events").insert({
    monthly_audit_id: event.monthlyAuditId ?? null,
    tenant_apotek_id: event.tenantApotekId,
    period_month: event.periodMonth,
    period_year: event.periodYear,
    action: event.action,
    actor_user_id: event.actorUserId,
    target_user_id: event.targetUserId ?? null,
    from_status: event.fromStatus ?? null,
    to_status: event.toStatus ?? null,
    metadata: event.metadata ?? null,
  });
  if (error) console.error("logAuditStateEvent failed", event.action, error);
}

export async function toggleCrewLockAction(auditId: string, userId: string, currentStatus: boolean) {
  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  
  const access = await assertAuditMutationAccess();
  if ("error" in access) return { error: access.error };

  // Get current session user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi habis, silakan login kembali." };

  // CHECK: If main audit is APPROVED, cannot unlock
  const { data: mainAudit } = await supabaseAdmin
    .from("monthly_audits")
    .select("status, tenant_apotek_id, period_month, period_year")
    .eq("id", auditId)
    .single();

  if (!mainAudit) {
    return { error: "Data audit tidak ditemukan." };
  }

  const publishCheck = await assertNotPublishedPayrollPeriod(
    supabaseAdmin,
    String(mainAudit.tenant_apotek_id),
    Number(mainAudit.period_month),
    Number(mainAudit.period_year),
  );
  if (publishCheck.error) {
    return { error: publishCheck.error };
  }

  if (mainAudit.status === 'APPROVED' && currentStatus === true) {
     return { error: "Audit sudah disetujui, tidak dapat membuka kunci." };
  }

  // Update lock status
  const { error } = await supabaseAdmin
    .from("monthly_crew_audits")
    .upsert({
      monthly_audit_id: auditId,
      user_id: userId,
      is_locked: !currentStatus,
      locked_at: !currentStatus ? new Date().toISOString() : null,
      locked_by: !currentStatus ? user.id : null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'monthly_audit_id, user_id' });

  if (error) {
    console.error("Lock toggle error:", error);
    return { error: "Gagal mengubah status kunci." };
  }

  await logAuditStateEvent(supabaseAdmin, {
    monthlyAuditId: auditId,
    tenantApotekId: String(mainAudit.tenant_apotek_id),
    periodMonth: Number(mainAudit.period_month),
    periodYear: Number(mainAudit.period_year),
    action: !currentStatus ? "crew_lock" : "crew_unlock",
    actorUserId: user.id,
    targetUserId: userId,
  });

  await revalidateAuditDetailForMonthlyAuditId(supabaseAdmin, auditId);
  return {
    success: true,
    message: !currentStatus ? "Data karyawan berhasil dikunci!" : "Data karyawan berhasil dibuka!"
  };
}

export async function updateCrewAuditAction(
  auditId: string,
  userId: string,
  updates: {
    analyst_score?: number,
    bba_adjustment?: number,
    analyst_feedback?: string,
    internal_review_score?: number,
    customer_review_score?: number
  }
) {
  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const access = await assertAuditMutationAccess();
  if ("error" in access) return { error: access.error };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi habis, silakan login kembali." };

  const { data: mainAudit } = await supabaseAdmin
    .from("monthly_audits")
    .select("status, tenant_apotek_id, period_month, period_year")
    .eq("id", auditId)
    .maybeSingle();

  if (!mainAudit) {
    return { error: "Audit tidak ditemukan." };
  }
  if (mainAudit.status === "APPROVED") {
    return { error: "Audit sudah approved dan tidak dapat diubah." };
  }
  const publishCheck = await assertNotPublishedPayrollPeriod(
    supabaseAdmin,
    String(mainAudit.tenant_apotek_id),
    Number(mainAudit.period_month),
    Number(mainAudit.period_year),
  );
  if (publishCheck.error) {
    return { error: publishCheck.error };
  }

  // SECURITY CHECK: Check if locked
  const { data: crewAudit } = await supabaseAdmin
    .from("monthly_crew_audits")
    .select("is_locked")
    .eq("monthly_audit_id", auditId)
    .eq("user_id", userId)
    .single();

  if (crewAudit?.is_locked) {
    return { error: "Data sudah dikunci, tidak dapat diubah." };
  }
  
  const { error } = await supabaseAdmin
    .from("monthly_crew_audits")
    .upsert({
      monthly_audit_id: auditId,
      user_id: userId,
      ...updates,
      updated_at: new Date().toISOString()
    }, { onConflict: 'monthly_audit_id, user_id' });

  if (error) {
    console.error("Update crew audit error:", error);
    return { error: "Gagal menyimpan perubahan." };
  }

  await logAuditStateEvent(supabaseAdmin, {
    monthlyAuditId: auditId,
    tenantApotekId: String(mainAudit.tenant_apotek_id),
    periodMonth: Number(mainAudit.period_month),
    periodYear: Number(mainAudit.period_year),
    action: "crew_audit_update",
    actorUserId: user.id,
    targetUserId: userId,
    metadata: { fields: Object.keys(updates) },
  });

  await revalidateAuditDetailForMonthlyAuditId(supabaseAdmin, auditId);
  return { success: true, message: "Data berhasil disimpan!" };
}

export async function submitAuditForReviewAction(auditId: string) {
  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const access = await assertAuditMutationAccess();
  if ("error" in access) return { error: access.error };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi habis, silakan login kembali." };

  const { data: auditRow } = await supabaseAdmin
    .from("monthly_audits")
    .select("id, status, tenant_apotek_id, period_month, period_year")
    .eq("id", auditId)
    .maybeSingle();

  if (!auditRow?.id) {
    return { error: "Audit tidak ditemukan." };
  }
  if (auditRow.status === "UNDER_REVIEW") {
    return { error: "Audit sudah dalam tahap review." };
  }
  if (auditRow.status === "APPROVED") {
    return { error: "Audit sudah disetujui." };
  }
  if (!canTransitionAuditState(String(auditRow.status), "UNDER_REVIEW")) {
    return { error: `Transisi status tidak valid: ${auditRow.status} -> UNDER_REVIEW.` };
  }

  const publishCheck = await assertNotPublishedPayrollPeriod(
    supabaseAdmin,
    String(auditRow.tenant_apotek_id),
    Number(auditRow.period_month),
    Number(auditRow.period_year),
  );
  if (publishCheck.error) {
    return { error: publishCheck.error };
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("monthly_audits")
    .update({
      status: "UNDER_REVIEW",
      updated_at: nowIso,
    })
    .eq("id", auditId);

  if (error) {
    console.error("submitAuditForReviewAction", error);
    return { error: "Gagal memulai review audit." };
  }

  await logAuditStateEvent(supabaseAdmin, {
    monthlyAuditId: auditId,
    tenantApotekId: String(auditRow.tenant_apotek_id),
    periodMonth: Number(auditRow.period_month),
    periodYear: Number(auditRow.period_year),
    action: "submit_for_review",
    actorUserId: user.id,
    fromStatus: String(auditRow.status),
    toStatus: "UNDER_REVIEW",
  });

  await revalidateAuditDetailForMonthlyAuditId(supabaseAdmin, auditId);
  return { success: true, message: "Audit dipindahkan ke tahap Under Review." };
}

export async function finalizeAuditAction(auditId: string) {
  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();

  const access = await assertAuditMutationAccess();
  if ("error" in access) return { error: access.error };
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi habis, silakan login kembali." };

  const { data: auditRow } = await supabaseAdmin
    .from("monthly_audits")
    .select("id, status, tenant_apotek_id, period_month, period_year")
    .eq("id", auditId)
    .maybeSingle();

  if (!auditRow?.id) {
    return { error: "Audit tidak ditemukan." };
  }
  if (auditRow?.status === "APPROVED") {
    return { error: "Audit sudah difinalisasi." };
  }
  if (!canTransitionAuditState(String(auditRow.status), "APPROVED")) {
    return { error: `Transisi status tidak valid: ${auditRow.status} -> APPROVED.` };
  }

  const publishCheck = await assertNotPublishedPayrollPeriod(
    supabaseAdmin,
    String(auditRow.tenant_apotek_id),
    Number(auditRow.period_month),
    Number(auditRow.period_year),
  );
  if (publishCheck.error) {
    return { error: publishCheck.error };
  }

  // Step 1: update audit status to APPROVED.
  // Step 2: lock crew rows — if fails, rollback step 1.
  // Step 3: sync appraisals — if fails, rollback step 1 + step 2.
  // This ordering ensures appraisals only sync when the audit is fully locked.
  const nowIso = new Date().toISOString();
  const { error: auditError } = await supabaseAdmin
    .from("monthly_audits")
    .update({
      status: 'APPROVED',
      approved_by: user.id,
      approved_at: nowIso,
      updated_at: nowIso
    })
    .eq("id", auditId);

  if (auditError) {
    console.error("Finalize audit error:", auditError);
    return { error: "Gagal memfinalisasi audit." };
  }

  // Automatically lock all crew audits
  const { error: crewError } = await supabaseAdmin
    .from("monthly_crew_audits")
    .update({
      is_locked: true,
      locked_by: user.id,
      locked_at: nowIso,
      updated_at: nowIso
    })
    .eq("monthly_audit_id", auditId);

  if (crewError) {
    console.error("Lock crew audits error:", crewError);
    await supabaseAdmin
      .from("monthly_audits")
      .update({
        status: String(auditRow.status),
        approved_by: null,
        approved_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", auditId);
    return { error: "Finalisasi dibatalkan karena lock baris karyawan gagal. Tidak ada perubahan status final." };
  }

  const syncResult = await syncMonthlyAppraisalsForAuditPeriod(supabaseAdmin, {
    auditId,
    actorUserId: user.id,
  });
  if (syncResult.error) {
    console.error("Sync appraisals error after lock:", syncResult.error);
    // Rollback: revert status and unlock crew
    await supabaseAdmin
      .from("monthly_audits")
      .update({
        status: String(auditRow.status),
        approved_by: null,
        approved_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", auditId);
    await supabaseAdmin
      .from("monthly_crew_audits")
      .update({ is_locked: false, locked_by: null, locked_at: null, updated_at: new Date().toISOString() })
      .eq("monthly_audit_id", auditId);
    return { error: `Finalisasi dibatalkan karena sinkronisasi rapor gagal: ${syncResult.error}` };
  }

  await logAuditStateEvent(supabaseAdmin, {
    monthlyAuditId: auditId,
    tenantApotekId: String(auditRow.tenant_apotek_id),
    periodMonth: Number(auditRow.period_month),
    periodYear: Number(auditRow.period_year),
    action: "finalize",
    actorUserId: user.id,
    fromStatus: String(auditRow.status),
    toStatus: "APPROVED",
  });

  await revalidateAuditDetailForMonthlyAuditId(supabaseAdmin, auditId);
  revalidatePath("/bba/payroll");
  return { success: true, message: "Audit berhasil difinalisasi, rapor bulanan disinkronkan, dan dikirim ke Keuangan!" };
}

export async function reopenApprovedAuditAsGlobalAdminAction(auditId: string) {
  const session = await getSessionContext();
  if (!session?.isGlobalSuperAdmin) {
    return { error: "Hanya super admin global yang dapat membuka kembali audit yang sudah disetujui." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi habis, silakan login kembali." };

  const { data: appUser } = await supabase
    .from("app_users")
    .select("is_global_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!appUser?.is_global_admin) {
    return { error: "Akses ditolak." };
  }

  const supabaseAdmin = createAdminClient();
  const { data: auditRow } = await supabaseAdmin
    .from("monthly_audits")
    .select("id, status, approved_by, approved_at")
    .eq("id", auditId)
    .maybeSingle();

  if (!auditRow) {
    return { error: "Audit tidak ditemukan." };
  }
  if (auditRow.status !== "APPROVED") {
    return { error: "Hanya audit berstatus APPROVED yang dapat dibuka kembali dengan aksi ini." };
  }
  if (!canTransitionAuditState("APPROVED", "UNDER_REVIEW")) {
    return { error: "Transisi status tidak valid." };
  }

  const nowIso = new Date().toISOString();
  const { error: auditErr } = await supabaseAdmin
    .from("monthly_audits")
    .update({
      status: "UNDER_REVIEW",
      approved_by: null,
      approved_at: null,
      updated_at: nowIso,
    })
    .eq("id", auditId);

  if (auditErr) {
    console.error("reopenApprovedAuditAsGlobalAdminAction audit", auditErr);
    return { error: "Gagal memperbarui status audit." };
  }

  const { error: crewErr } = await supabaseAdmin
    .from("monthly_crew_audits")
    .update({
      is_locked: false,
      locked_by: null,
      locked_at: null,
      updated_at: nowIso,
    })
    .eq("monthly_audit_id", auditId);

  if (crewErr) {
    console.error("reopenApprovedAuditAsGlobalAdminAction crew", crewErr);
    // Rollback: revert audit status back to APPROVED
    await supabaseAdmin
      .from("monthly_audits")
      .update({
        status: "APPROVED",
        approved_by: auditRow.approved_by,
        approved_at: auditRow.approved_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", auditId);
    return { error: "Gagal membuka kunci baris karyawan. Status audit dikembalikan ke APPROVED." };
  }

  // Fetch tenant/period for the event log (not in auditRow select above)
  const { data: auditMeta } = await supabaseAdmin
    .from("monthly_audits")
    .select("tenant_apotek_id, period_month, period_year")
    .eq("id", auditId)
    .maybeSingle();

  if (auditMeta) {
    await logAuditStateEvent(supabaseAdmin, {
      monthlyAuditId: auditId,
      tenantApotekId: String(auditMeta.tenant_apotek_id),
      periodMonth: Number(auditMeta.period_month),
      periodYear: Number(auditMeta.period_year),
      action: "reopen",
      actorUserId: user.id,
      fromStatus: "APPROVED",
      toStatus: "UNDER_REVIEW",
      metadata: {
        previously_approved_by: auditRow.approved_by ?? null,
        previously_approved_at: auditRow.approved_at ?? null,
      },
    });
  }

  await revalidateAuditDetailForMonthlyAuditId(supabaseAdmin, auditId);
  revalidatePath("/bba/payroll");
  return { success: true, message: "Audit dibuka kembali (UNDER_REVIEW). Baris karyawan tidak terkunci." };
}

export async function upsertMonthlyAddonAppraisalAction(input: {
  tenantApotekId: string;
  periodMonth: number;
  periodYear: number;
  crewUserId: string;
  addonKey: string;
  scoreManual: number | null;
  nominalManual: number | null;
  notes: string | null;
}) {
  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();
  const access = await assertAuditMutationAccess();
  if ("error" in access) return { error: access.error };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi habis, silakan login kembali." };

  if (!ALLOWED_ADDON_KEYS.includes(input.addonKey as (typeof ALLOWED_ADDON_KEYS)[number])) {
    return { error: "Jenis add-on tidak valid." };
  }

  const { data: mainAudit } = await supabaseAdmin
    .from("monthly_audits")
    .select("id, status")
    .eq("tenant_apotek_id", input.tenantApotekId)
    .eq("period_month", input.periodMonth)
    .eq("period_year", input.periodYear)
    .maybeSingle();

  if (mainAudit?.status === "APPROVED") {
    return { error: "Audit sudah disetujui, penilaian add-on tidak dapat diubah." };
  }

  const publishCheck = await assertNotPublishedPayrollPeriod(
    supabaseAdmin,
    input.tenantApotekId,
    input.periodMonth,
    input.periodYear,
  );
  if (publishCheck.error) {
    return { error: publishCheck.error };
  }

  if (mainAudit?.id) {
    const { data: crewAudit } = await supabaseAdmin
      .from("monthly_crew_audits")
      .select("is_locked")
      .eq("monthly_audit_id", mainAudit.id)
      .eq("user_id", input.crewUserId)
      .maybeSingle();
    if (crewAudit?.is_locked) {
      return { error: "Baris audit karyawan terkunci, tidak dapat menyimpan penilaian add-on." };
    }
  }

  const { data: addonRow } = await supabaseAdmin
    .from("monthly_addon_appraisals")
    .select("is_locked")
    .eq("tenant_apotek_id", input.tenantApotekId)
    .eq("period_month", input.periodMonth)
    .eq("period_year", input.periodYear)
    .eq("crew_user_id", input.crewUserId)
    .eq("addon_key", input.addonKey)
    .maybeSingle();

  if (addonRow?.is_locked) {
    return { error: "Penilaian add-on untuk periode ini terkunci (publish payroll)." };
  }

  const scoreParsed =
    input.scoreManual === null || Number.isNaN(Number(input.scoreManual))
      ? 0
      : Number(input.scoreManual);
  const nominalParsed =
    input.nominalManual === null || Number.isNaN(Number(input.nominalManual))
      ? 0
      : Number(input.nominalManual);
  if (scoreParsed < 0 || scoreParsed > 100) {
    return { error: "Skor add-on harus di rentang 0 sampai 100." };
  }
  if (nominalParsed < MIN_ADDON_NOMINAL || nominalParsed > MAX_ADDON_NOMINAL) {
    return { error: "Nominal add-on di luar rentang yang diizinkan." };
  }

  const { error } = await supabaseAdmin.from("monthly_addon_appraisals").upsert(
    {
      tenant_apotek_id: input.tenantApotekId,
      crew_user_id: input.crewUserId,
      period_month: input.periodMonth,
      period_year: input.periodYear,
      addon_key: input.addonKey,
      score_manual: scoreParsed,
      nominal_manual: nominalParsed,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_apotek_id, crew_user_id, period_month, period_year, addon_key" },
  );

  if (error) {
    console.error("upsertMonthlyAddonAppraisalAction", error);
    return { error: "Gagal menyimpan penilaian add-on." };
  }

  await logAuditStateEvent(supabaseAdmin, {
    monthlyAuditId: mainAudit?.id ?? null,
    tenantApotekId: input.tenantApotekId,
    periodMonth: input.periodMonth,
    periodYear: input.periodYear,
    action: "addon_upsert",
    actorUserId: user.id,
    targetUserId: input.crewUserId,
    metadata: {
      addon_key: input.addonKey,
      score_manual: scoreParsed,
      nominal_manual: nominalParsed,
    },
  });

  revalidatePath(`/bba/audit/${input.tenantApotekId}`);
  return { success: true };
}

export async function publishAuditAppraisalPeriodAction(auditId: string, reason: string) {
  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();

  const access = await assertAuditMutationAccess();
  if ("error" in access) return { error: access.error };

  if (!reason || reason.trim().length < 3) {
    return { error: "Alasan publish harus diisi minimal 3 karakter." };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi habis, silakan login kembali." };

  const { data: auditRow } = await supabaseAdmin
    .from("monthly_audits")
    .select("id, status, tenant_apotek_id, period_month, period_year")
    .eq("id", auditId)
    .maybeSingle();

  if (!auditRow) return { error: "Audit tidak ditemukan." };
  if (auditRow.status !== "APPROVED") return { error: "Audit harus berstatus APPROVED sebelum dapat dipublish." };

  const tenantId = auditRow.tenant_apotek_id as string;
  const periodMonth = Number(auditRow.period_month);
  const periodYear = Number(auditRow.period_year);

  const { data: appraisalRows, error: appraisalErr } = await supabaseAdmin
    .from("monthly_appraisals")
    .select("id, is_published")
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear);

  if (appraisalErr) return { error: "Gagal membaca data rapor." };
  if (!appraisalRows || appraisalRows.length === 0) {
    return { error: "Belum ada data rapor. Pastikan finalisasi audit sudah selesai." };
  }
  if (appraisalRows.every((r) => r.is_published)) {
    return { error: "Rapor periode ini sudah dipublish sebelumnya." };
  }

  const nowIso = new Date().toISOString();

  const { error: publishErr } = await supabaseAdmin
    .from("monthly_appraisals")
    .update({ is_published: true, published_at: nowIso, published_by_user_id: user.id })
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear)
    .eq("is_published", false);

  if (publishErr) {
    console.error("publishAuditAppraisalPeriodAction", publishErr);
    return { error: "Gagal publish rapor." };
  }

  await supabaseAdmin
    .from("monthly_addon_appraisals")
    .update({ is_locked: true })
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear);

  await supabaseAdmin
    .from("monthly_appraisal_publish_events")
    .insert({
      tenant_apotek_id: tenantId,
      period_month: periodMonth,
      period_year: periodYear,
      action: "publish",
      actor_user_id: user.id,
      reason: reason.trim(),
    });

  revalidatePath(`/bba/audit/${tenantId}`);
  revalidatePath("/bba/payroll");
  return { success: true };
}

export async function unpublishAuditAppraisalPeriodAction(auditId: string, reason: string) {
  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();

  const access = await assertAuditMutationAccess();
  if ("error" in access) return { error: access.error };

  if (!reason || reason.trim().length < 3) {
    return { error: "Alasan unpublish harus diisi minimal 3 karakter." };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi habis, silakan login kembali." };

  const { data: auditRow } = await supabaseAdmin
    .from("monthly_audits")
    .select("id, status, tenant_apotek_id, period_month, period_year")
    .eq("id", auditId)
    .maybeSingle();

  if (!auditRow) return { error: "Audit tidak ditemukan." };

  const tenantId = auditRow.tenant_apotek_id as string;
  const periodMonth = Number(auditRow.period_month);
  const periodYear = Number(auditRow.period_year);

  const { data: appraisalRows, error: fetchErr } = await supabaseAdmin
    .from("monthly_appraisals")
    .select("id, is_published")
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear);

  if (fetchErr) return { error: "Gagal membaca data rapor." };
  if (!appraisalRows || appraisalRows.length === 0) return { error: "Tidak ada rapor untuk periode ini." };
  if (appraisalRows.every((r) => !r.is_published)) return { error: "Rapor periode ini belum dipublish." };

  const nowIso = new Date().toISOString();

  const { error: unpublishErr } = await supabaseAdmin
    .from("monthly_appraisals")
    .update({ is_published: false, published_at: null, published_by_user_id: null })
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear)
    .eq("is_published", true);

  if (unpublishErr) {
    console.error("unpublishAuditAppraisalPeriodAction", unpublishErr);
    return { error: "Gagal unpublish rapor." };
  }

  await supabaseAdmin
    .from("monthly_addon_appraisals")
    .update({ is_locked: false })
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear);

  await supabaseAdmin
    .from("monthly_appraisal_publish_events")
    .insert({
      tenant_apotek_id: tenantId,
      period_month: periodMonth,
      period_year: periodYear,
      action: "unpublish",
      actor_user_id: user.id,
      reason: reason.trim(),
      created_at: nowIso,
    });

  revalidatePath(`/bba/audit/${tenantId}`);
  revalidatePath("/bba/payroll");
  return { success: true };
}

export async function recalculateAuditAppraisalAction(auditId: string, reason: string) {
  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();

  const access = await assertAuditMutationAccess();
  if ("error" in access) return { error: access.error };

  if (!reason || reason.trim().length < 3) {
    return { error: "Alasan recalculate harus diisi minimal 3 karakter." };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sesi habis, silakan login kembali." };

  const { data: auditRow } = await supabaseAdmin
    .from("monthly_audits")
    .select("id, status, tenant_apotek_id, period_month, period_year")
    .eq("id", auditId)
    .maybeSingle();

  if (!auditRow) return { error: "Audit tidak ditemukan." };
  if (auditRow.status !== "APPROVED") return { error: "Recalculate hanya bisa dilakukan setelah audit APPROVED." };

  const tenantId = auditRow.tenant_apotek_id as string;
  const periodMonth = Number(auditRow.period_month);
  const periodYear = Number(auditRow.period_year);

  const { data: publishedCheck } = await supabaseAdmin
    .from("monthly_appraisals")
    .select("is_published")
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear)
    .eq("is_published", true)
    .limit(1)
    .maybeSingle();

  if (publishedCheck?.is_published) {
    return { error: "Rapor sudah dipublish, tidak dapat direcalculate. Unpublish terlebih dahulu." };
  }

  const result = await syncMonthlyAppraisalsForPeriod(supabaseAdmin, {
    tenantApotekId: tenantId,
    periodMonth,
    periodYear,
    actorUserId: user.id,
    auditId,
    reason,
    source: "audit_recalculate",
    excludePublishedUsers: true,
    preservePublishState: true,
    preserveExistingAdjustments: false,
  });

  if (result.error) return { error: result.error };

  await logAuditStateEvent(supabaseAdmin, {
    monthlyAuditId: auditId,
    tenantApotekId: tenantId,
    periodMonth,
    periodYear,
    action: "recalculate",
    actorUserId: user.id,
    metadata: {
      reason,
      affected_user_count: result.affectedUserCount,
    },
  });

  revalidatePath(`/bba/audit/${tenantId}`);
  return { success: true, affectedUserCount: result.affectedUserCount };
}
