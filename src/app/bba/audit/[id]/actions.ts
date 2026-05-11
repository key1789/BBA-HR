"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth-context";
import { revalidatePath } from "next/cache";

const AUDIT_COUNTED_SUBMISSION_STATUSES = ["approved", "edited_by_admin"] as const;
const ALLOWED_ADDON_KEYS = ["absensi_shift", "review_internal", "review_pelanggan"] as const;
const MIN_ADDON_NOMINAL = -10_000_000;
const MAX_ADDON_NOMINAL = 10_000_000;
const ALLOWED_AUDIT_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["UNDER_REVIEW", "APPROVED"],
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
    return { error: "Akses ditolak untuk modul audit." } as const;
  }
  if (session?.activeMembership?.role !== "super_admin_bba") {
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

  const tenantId = audit.tenant_apotek_id as string;
  const periodMonth = Number(audit.period_month);
  const periodYear = Number(audit.period_year);
  const periodStart = `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`;
  const periodEnd = `${periodYear}-${String(periodMonth).padStart(2, "0")}-${String(
    new Date(periodYear, periodMonth, 0).getDate(),
  ).padStart(2, "0")}`;

  const { data: crewMembershipData, error: crewMemErr } = await supabaseAdmin
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_apotek_id", tenantId)
    .eq("role", "crew")
    .eq("is_active", true);

  if (crewMemErr) {
    return { error: "Gagal membaca membership crew." };
  }

  const crewUserIds = Array.from(
    new Set((crewMembershipData ?? []).map((r) => r.user_id as string).filter(Boolean)),
  );
  if (crewUserIds.length === 0) {
    return {};
  }

  const { data: submissionData, error: subErr } = await supabaseAdmin
    .from("daily_submissions")
    .select("user_id, omzet_total")
    .eq("tenant_apotek_id", tenantId)
    .in("status", [...AUDIT_COUNTED_SUBMISSION_STATUSES])
    .in("user_id", crewUserIds)
    .gte("submission_date", periodStart)
    .lte("submission_date", periodEnd);

  if (subErr) {
    return { error: "Gagal membaca submission untuk sinkron rapor." };
  }

  const { data: crewAuditRows } = await supabaseAdmin
    .from("monthly_crew_audits")
    .select("user_id, bba_adjustment")
    .eq("monthly_audit_id", params.auditId);

  const bbaByUser = new Map<string, number>();
  for (const row of crewAuditRows ?? []) {
    const uid = row.user_id as string;
    if (!uid) continue;
    bbaByUser.set(uid, Number(row.bba_adjustment ?? 0));
  }

  const { data: addonRows } = await supabaseAdmin
    .from("monthly_addon_appraisals")
    .select("crew_user_id, nominal_manual")
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear);

  const addonSumByUser = new Map<string, number>();
  for (const row of addonRows ?? []) {
    const uid = row.crew_user_id as string;
    if (!uid) continue;
    addonSumByUser.set(uid, (addonSumByUser.get(uid) ?? 0) + Number(row.nominal_manual ?? 0));
  }

  const { data: existingAppraisalData, error: exErr } = await supabaseAdmin
    .from("monthly_appraisals")
    .select("crew_user_id, is_published")
    .eq("tenant_apotek_id", tenantId)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear);

  if (exErr) {
    return { error: "Gagal membaca rapor bulanan (monthly_appraisals)." };
  }

  const publishedSet = new Set(
    (existingAppraisalData ?? []).filter((r) => r.is_published).map((r) => r.crew_user_id as string),
  );

  const aggregationMap = new Map<string, { count: number; omzet: number }>();
  for (const row of submissionData ?? []) {
    const uid = row.user_id as string;
    if (!uid) continue;
    const cur = aggregationMap.get(uid) ?? { count: 0, omzet: 0 };
    cur.count += 1;
    cur.omzet += Number(row.omzet_total ?? 0);
    aggregationMap.set(uid, cur);
  }

  const upsertPayload = crewUserIds
    .filter((crewUserId) => !publishedSet.has(crewUserId))
    .map((crewUserId) => {
      const agg = aggregationMap.get(crewUserId) ?? { count: 0, omzet: 0 };
      const addonManualTotal = addonSumByUser.get(crewUserId) ?? 0;
      const bbaAdjustment = bbaByUser.get(crewUserId) ?? 0;
      const calcBreakdown = {
        approvedSubmissionCount: agg.count,
        approvedOmzetTotal: agg.omzet,
        autoBonusFormula: "v1_baseline",
        generatedAt: new Date().toISOString(),
        generatedBy: params.actorUserId,
        periodStart,
        periodEnd,
        reason: "audit_finalize_sync",
        source: "monthly_audit_finalize",
      };

      return {
        tenant_apotek_id: tenantId,
        crew_user_id: crewUserId,
        period_month: periodMonth,
        period_year: periodYear,
        approved_submission_count: agg.count,
        approved_omzet_total: agg.omzet,
        minus_point_total: 0,
        auto_bonus_accountability: 0,
        addon_manual_total: addonManualTotal,
        bba_adjustment: bbaAdjustment,
        calc_version: "v1_baseline",
        calc_breakdown: calcBreakdown,
        is_published: false,
        published_at: null,
        published_by_user_id: null,
      };
    });

  if (upsertPayload.length === 0) {
    return {};
  }

  const { error: upsertError } = await supabaseAdmin.from("monthly_appraisals").upsert(upsertPayload, {
    onConflict: "tenant_apotek_id,crew_user_id,period_month,period_year",
  });

  if (upsertError) {
    console.error("syncMonthlyAppraisalsForAuditPeriod", upsertError);
    return { error: "Gagal menyinkronkan rapor bulanan (monthly_appraisals)." };
  }

  return {};
}

async function revalidateAuditDetailForMonthlyAuditId(supabaseAdmin: ReturnType<typeof createAdminClient>, auditId: string) {
  const { data } = await supabaseAdmin.from("monthly_audits").select("tenant_apotek_id").eq("id", auditId).maybeSingle();
  if (data?.tenant_apotek_id) {
    revalidatePath(`/bba/audit/${data.tenant_apotek_id}`);
  }
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

  const publishCheck = await assertNotPublishedPayrollPeriod(
    supabaseAdmin,
    String(mainAudit?.tenant_apotek_id ?? ""),
    Number(mainAudit?.period_month ?? 0),
    Number(mainAudit?.period_year ?? 0),
  );
  if (publishCheck.error) {
    return { error: publishCheck.error };
  }

  if (mainAudit?.status === 'APPROVED' && currentStatus === true) {
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
  const access = await assertAuditMutationAccess();
  if ("error" in access) return { error: access.error };

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

  await revalidateAuditDetailForMonthlyAuditId(supabaseAdmin, auditId);
  return { success: true, message: "Data berhasil disimpan!" };
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

  const syncResult = await syncMonthlyAppraisalsForAuditPeriod(supabaseAdmin, {
    auditId,
    actorUserId: user.id,
  });
  if (syncResult.error) {
    return { error: syncResult.error };
  }

  // Step 1: update audit status.
  // Step 2: lock crew rows.
  // If step 2 fails, rollback step 1 to prevent partial finalize.
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
    .select("id, status")
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
    return { error: "Status audit diubah, tetapi gagal membuka kunci baris karyawan." };
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
  const access = await assertAuditMutationAccess();
  if ("error" in access) return { error: access.error };

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

  revalidatePath(`/bba/audit/${input.tenantApotekId}`);
  return { success: true };
}
