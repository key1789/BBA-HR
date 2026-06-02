"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/auth-context";
import { writeAuditLog } from "@/lib/audit-log";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function toQueryString(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  return query.toString();
}

function adminAttendanceApprovalPath(params: Record<string, string | undefined>) {
  const qs = toQueryString(params);
  return qs ? `/admin/absensi?${qs}` : "/admin/absensi";
}

function getJakartaDateKey(now = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(now); // YYYY-MM-DD
}

// 1. CLOCK IN ACTION
export async function clockInAction(formData: FormData) {
  const session = await getSessionContext();
  if (!session || !session.activeMembership) return { error: "Unauthorized" };

  const tenantId = session.activeMembership.tenantId;
  const userId = session.userId;
  
  const photoBase64 = formData.get("photoBase64")?.toString();
  if (!photoBase64) return { error: "Photo required" };

  const supabase = await createClient();
  const supabaseAdmin = createAdminClient();
  const todayDate = getJakartaDateKey();

  // Parse Base64
  const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");
  const fileName = `attendance/${tenantId}/${userId}/${Date.now()}.jpg`;

  // Upload to bucket
  const { error: uploadError } = await supabase
    .storage
    .from("hr_files")
    .upload(fileName, buffer, {
      contentType: "image/jpeg",
      upsert: true
    });

  if (uploadError) {
    console.error("Failed to upload photo:", uploadError);
    return { error: "Upload failed" };
  }

  const { data: publicUrlData } = supabase.storage.from("hr_files").getPublicUrl(fileName);
  const photoUrl = publicUrlData.publicUrl;

  const { data: schedule } = await supabaseAdmin
    .from("shift_schedules")
    .select("id, is_off, master_shifts(start_time)")
    .eq("tenant_apotek_id", tenantId)
    .eq("user_id", userId)
    .eq("schedule_date", todayDate)
    .single();

  let isLate = false;
  let scheduleId = null;

  if (!schedule || schedule.is_off) {
    return { error: "Jadwal shift aktif untuk hari ini tidak ditemukan." };
  }

  if (schedule.master_shifts) {
    scheduleId = schedule.id;
    const shift = Array.isArray(schedule.master_shifts)
      ? schedule.master_shifts[0]
      : schedule.master_shifts;
    if (shift?.start_time) {
      // Compare in WIB (Asia/Jakarta) — Vercel runs UTC so setHours without timezone
      // would compare against UTC hours, not WIB hours.
      const nowWib = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }));
      const [hours, minutes] = shift.start_time.split(":").map(Number);
      const expectedStart = new Date(nowWib);
      expectedStart.setHours(hours, minutes, 0, 0);
      if (nowWib > expectedStart) {
        isLate = true;
      }
    }
  }

  // Prevent duplicate clock-in for same day (strictly one attendance per user per day).
  const dayStartUtc = new Date(`${todayDate}T00:00:00+07:00`).toISOString();
  const dayEndUtc = new Date(`${todayDate}T23:59:59.999+07:00`).toISOString();
  const { data: existingTodayLogs } = await supabaseAdmin
    .from("attendance_logs")
    .select("id, clock_in_time")
    .eq("tenant_apotek_id", tenantId)
    .eq("user_id", userId)
    .gte("clock_in_time", dayStartUtc)
    .lte("clock_in_time", dayEndUtc);

  if ((existingTodayLogs ?? []).length > 0) {
    return { error: "Anda sudah absen masuk hari ini." };
  }

  // Insert to attendance_logs
  const { error: insertError } = await supabaseAdmin.from("attendance_logs").insert({
    tenant_apotek_id: tenantId,
    user_id: userId,
    shift_schedule_id: scheduleId,
    photo_url: photoUrl,
    is_late: isLate,
  });

  if (insertError) {
    // Unique constraint violation: concurrent clock-in attempt on the same day
    if (insertError.code === "23505") {
      return { error: "Anda sudah absen masuk hari ini." };
    }
    console.error("Failed to insert attendance log:", insertError);
    return { error: "Gagal menyimpan absensi. Coba lagi." };
  }

  revalidatePath("/crew/kehadiran");
  return { success: true };
}

// 2. REQUEST LEAVE ACTION
export async function requestLeaveAction(formData: FormData) {
  const session = await getSessionContext();
  if (!session || !session.activeMembership) return { error: "Unauthorized" };

  const tenantId = session.activeMembership.tenantId;
  const userId = session.userId;
  
  const leaveType = formData.get("leaveType")?.toString();
  const startDate = formData.get("startDate")?.toString();
  const endDate = formData.get("endDate")?.toString();
  const reason = formData.get("reason")?.toString();
  const photoBase64 = formData.get("photoBase64")?.toString();

  if (!leaveType || !startDate || !endDate || !reason) return { error: "Missing fields" };
  const startMs = Date.parse(`${startDate}T00:00:00`);
  const endMs = Date.parse(`${endDate}T00:00:00`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return { error: "Tanggal izin tidak valid." };
  if (endMs < startMs) return { error: "Tanggal selesai tidak boleh sebelum tanggal mulai." };

  const supabase = await createClient();
  let attachmentUrl = null;

  // Handle Photo Upload if exists
  if (photoBase64) {
    const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const fileName = `leaves/${tenantId}/${userId}/${Date.now()}.jpg`;

    const { error: uploadError } = await supabase
      .storage
      .from("hr_files")
      .upload(fileName, buffer, {
        contentType: "image/jpeg",
        upsert: true
      });

    if (!uploadError) {
      const { data: publicUrlData } = supabase.storage.from("hr_files").getPublicUrl(fileName);
      attachmentUrl = publicUrlData.publicUrl;
    } else {
      console.error("Failed to upload leave attachment:", uploadError);
    }
  }

  const { error } = await supabase.from("leave_requests").insert({
    tenant_apotek_id: tenantId,
    user_id: userId,
    leave_type: leaveType,
    start_date: startDate,
    end_date: endDate,
    reason: reason,
    attachment_url: attachmentUrl,
    status: "pending"
  });

  if (error) {
    console.error("Failed to insert leave request:", error);
    return { error: "Database error" };
  }

  revalidatePath("/crew/kehadiran");
  return { success: true, message: "Pengajuan izin berhasil dikirim." };
}

// 3. REQUEST SHIFT SWAP ACTION
export async function requestShiftSwapAction(formData: FormData) {
  const session = await getSessionContext();
  if (!session || !session.activeMembership) return { error: "Unauthorized" };

  const tenantId = session.activeMembership.tenantId;
  const userId = session.userId;
  
  const requesterScheduleId = formData.get("requesterScheduleId")?.toString();
  const targetUserId = formData.get("targetUserId")?.toString();
  const reason = formData.get("reason")?.toString();

  if (!requesterScheduleId || !targetUserId || !reason) return { error: "Missing fields" };
  if (targetUserId === userId) return { error: "Tidak bisa tukar shift dengan diri sendiri." };

  const supabaseAdmin = createAdminClient();
  const { data: ownSchedule } = await supabaseAdmin
    .from("shift_schedules")
    .select("id, schedule_date")
    .eq("id", requesterScheduleId)
    .eq("tenant_apotek_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!ownSchedule) return { error: "Jadwal yang dipilih tidak valid." };

  const { data: targetMember } = await supabaseAdmin
    .from("tenant_memberships")
    .select("id")
    .eq("tenant_apotek_id", tenantId)
    .eq("user_id", targetUserId)
    .eq("is_active", true)
    .in("role", ["crew", "admin_apotek"])
    .maybeSingle();
  if (!targetMember) return { error: "Target tukar shift tidak valid." };

  // Resolve target schedule on the same date so swap request is fully linked.
  const { data: targetSchedule } = await supabaseAdmin
    .from("shift_schedules")
    .select("id")
    .eq("tenant_apotek_id", tenantId)
    .eq("user_id", targetUserId)
    .eq("schedule_date", ownSchedule.schedule_date)
    .maybeSingle();
  if (!targetSchedule) {
    return { error: "Kru target tidak memiliki jadwal pada tanggal yang sama." };
  }

  const { data: duplicatePending } = await supabaseAdmin
    .from("shift_swap_requests")
    .select("id")
    .eq("tenant_apotek_id", tenantId)
    .eq("requester_user_id", userId)
    .eq("requester_schedule_id", requesterScheduleId)
    .eq("target_user_id", targetUserId)
    .in("status", ["pending_crew", "pending_admin"])
    .maybeSingle();
  if (duplicatePending) return { error: "Pengajuan tukar shift serupa masih menunggu proses." };

  const { error } = await supabaseAdmin.from("shift_swap_requests").insert({
    tenant_apotek_id: tenantId,
    requester_user_id: userId,
    requester_schedule_id: requesterScheduleId,
    target_user_id: targetUserId,
    target_schedule_id: targetSchedule.id,
    reason: reason,
    status: "pending_admin", // langsung ke admin — tidak ada tahap persetujuan rekan
  });

  if (error) {
    console.error("Failed to insert shift swap:", error);
    return { error: "Database error" };
  }

  revalidatePath("/crew/kehadiran");
  return { success: true, message: "Pengajuan tukar shift berhasil dikirim." };
}

// 4. CANCEL LEAVE REQUEST — crew batalkan pengajuan izin yang masih pending
export async function cancelLeaveRequestAction(leaveId: string) {
  const session = await getSessionContext();
  if (!session || !session.activeMembership) return { error: "Unauthorized" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  // Verify ownership + status sebelum delete (defense in depth di atas RLS)
  const { data: leave } = await supabase
    .from("leave_requests")
    .select("id, status")
    .eq("id", leaveId)
    .eq("user_id", user.id)
    .eq("tenant_apotek_id", session.activeMembership.tenantId)
    .eq("status", "pending")
    .maybeSingle();

  if (!leave) return { error: "Pengajuan tidak ditemukan atau sudah tidak bisa dibatalkan." };

  const { error } = await supabase
    .from("leave_requests")
    .delete()
    .eq("id", leaveId)
    .eq("user_id", user.id)
    .eq("status", "pending");

  if (error) {
    console.error("Failed to cancel leave request:", error);
    return { error: "Gagal membatalkan pengajuan." };
  }

  revalidatePath("/crew/kehadiran");
  return { success: true };
}

// 5. CANCEL SHIFT SWAP — crew batalkan pengajuan tukar shift yang masih pending
export async function cancelShiftSwapAction(swapId: string) {
  const session = await getSessionContext();
  if (!session || !session.activeMembership) return { error: "Unauthorized" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { data: swap } = await supabase
    .from("shift_swap_requests")
    .select("id, status")
    .eq("id", swapId)
    .eq("requester_user_id", user.id)
    .eq("tenant_apotek_id", session.activeMembership.tenantId)
    .in("status", ["pending_crew", "pending_admin"])
    .maybeSingle();

  if (!swap) return { error: "Pengajuan tidak ditemukan atau sudah tidak bisa dibatalkan." };

  const { error } = await supabase
    .from("shift_swap_requests")
    .delete()
    .eq("id", swapId)
    .eq("requester_user_id", user.id)
    .in("status", ["pending_crew", "pending_admin"]);

  if (error) {
    console.error("Failed to cancel shift swap:", error);
    return { error: "Gagal membatalkan pengajuan tukar shift." };
  }

  revalidatePath("/crew/kehadiran");
  return { success: true };
}

export async function reviewLeaveRequestAction(
  leaveRequestIdParam: string,
  decisionParam: "approved" | "rejected",
  formData: FormData,
) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "admin_apotek") {
    return redirect(
      adminAttendanceApprovalPath({
        feedback: "error",
        message: "access_denied",
      }),
    );
  }

  const leaveRequestId = (leaveRequestIdParam ?? "").trim();
  const adminNote = (formData.get("adminNote")?.toString() ?? "").trim();
  if (!leaveRequestId) {
    return redirect(
      adminAttendanceApprovalPath({
        feedback: "error",
        message: "leave_invalid_payload",
      }),
    );
  }
  if (decisionParam === "rejected" && !adminNote) {
    return redirect(
      adminAttendanceApprovalPath({
        feedback: "error",
        message: "admin_note_required",
      }),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return redirect(
      adminAttendanceApprovalPath({
        feedback: "error",
        message: "user_not_found",
      }),
    );
  }

  const { data: existingLeave } = await supabase
    .from("leave_requests")
    .select("id, user_id, leave_type, start_date, end_date, reason, status, reviewed_by")
    .eq("id", leaveRequestId)
    .eq("tenant_apotek_id", active.tenantId)
    .maybeSingle();
  if (!existingLeave || existingLeave.status !== "pending") {
    return redirect(
      adminAttendanceApprovalPath({
        feedback: "error",
        message: "leave_not_eligible",
      }),
    );
  }

  const { error: updateError } = await supabase
    .from("leave_requests")
    .update({
      status: decisionParam,
      reviewed_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leaveRequestId)
    .eq("tenant_apotek_id", active.tenantId)
    .eq("status", "pending");
  if (updateError) {
    return redirect(
      adminAttendanceApprovalPath({
        feedback: "error",
        message: "leave_update_failed",
      }),
    );
  }
  await writeAuditLog(supabase, {
    tenantApotekId: active.tenantId,
    actorUserId: user.id,
    entityType: "leave_request",
    entityId: leaveRequestId,
    action: decisionParam === "approved" ? "leave_approved" : "leave_rejected",
    oldValue: {
      status: existingLeave.status,
      reviewed_by: existingLeave.reviewed_by,
    },
    newValue: {
      status: decisionParam,
      reviewed_by: user.id,
      admin_note: adminNote || null,
      user_id: existingLeave.user_id,
      leave_type: existingLeave.leave_type,
      start_date: existingLeave.start_date,
      end_date: existingLeave.end_date,
      reason: existingLeave.reason,
    },
  });

  revalidatePath("/admin/absensi");
  revalidatePath("/crew/kehadiran");
  return redirect(
    adminAttendanceApprovalPath({
      feedback: "success",
      message: "leave_updated",
      decision: decisionParam,
    }),
  );
}

export async function reviewShiftSwapRequestAction(
  shiftSwapRequestIdParam: string,
  decisionParam: "approved" | "rejected",
  formData: FormData,
) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "admin_apotek") {
    return redirect(
      adminAttendanceApprovalPath({
        feedback: "error",
        message: "access_denied",
      }),
    );
  }

  const shiftSwapRequestId = (shiftSwapRequestIdParam ?? "").trim();
  const adminNote = (formData.get("adminNote")?.toString() ?? "").trim();
  if (!shiftSwapRequestId) {
    return redirect(
      adminAttendanceApprovalPath({
        feedback: "error",
        message: "swap_invalid_payload",
      }),
    );
  }
  if (decisionParam === "rejected" && !adminNote) {
    return redirect(
      adminAttendanceApprovalPath({
        feedback: "error",
        message: "admin_note_required",
      }),
    );
  }

  const supabase = await createClient();
  const { data: swapRequest } = await supabase
    .from("shift_swap_requests")
    .select("id, requester_user_id, target_user_id, requester_schedule_id, target_schedule_id, status, reason")
    .eq("id", shiftSwapRequestId)
    .eq("tenant_apotek_id", active.tenantId)
    .in("status", ["pending_crew", "pending_admin"])
    .maybeSingle();
  if (!swapRequest) {
    return redirect(
      adminAttendanceApprovalPath({
        feedback: "error",
        message: "swap_not_eligible",
      }),
    );
  }

  if (decisionParam === "rejected") {
    const { error: rejectError } = await supabase
      .from("shift_swap_requests")
      .update({
        status: "rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", shiftSwapRequestId)
      .eq("tenant_apotek_id", active.tenantId)
      .in("status", ["pending_crew", "pending_admin"]);
    if (rejectError) {
      return redirect(
        adminAttendanceApprovalPath({
          feedback: "error",
          message: "swap_update_failed",
        }),
      );
    }
    await writeAuditLog(supabase, {
      tenantApotekId: active.tenantId,
      actorUserId: session.userId,
      entityType: "shift_swap_request",
      entityId: shiftSwapRequestId,
      action: "shift_swap_rejected",
      oldValue: {
        status: swapRequest.status,
      },
      newValue: {
        status: "rejected",
        admin_note: adminNote || null,
      },
    });

    revalidatePath("/admin/absensi");
    revalidatePath("/crew/kehadiran");
    return redirect(
      adminAttendanceApprovalPath({
        feedback: "success",
        message: "swap_updated",
        decision: "rejected",
      }),
    );
  }

  if (!swapRequest.target_schedule_id) {
    return redirect(
      adminAttendanceApprovalPath({
        feedback: "error",
        message: "swap_missing_target_schedule",
      }),
    );
  }

  const scheduleIds = [swapRequest.requester_schedule_id, swapRequest.target_schedule_id];
  const { data: schedules } = await supabase
    .from("shift_schedules")
    .select("id, shift_id, is_off")
    .eq("tenant_apotek_id", active.tenantId)
    .in("id", scheduleIds);
  const requesterSchedule = (schedules ?? []).find((s) => s.id === swapRequest.requester_schedule_id);
  const targetSchedule = (schedules ?? []).find((s) => s.id === swapRequest.target_schedule_id);
  if (!requesterSchedule || !targetSchedule) {
    return redirect(
      adminAttendanceApprovalPath({
        feedback: "error",
        message: "swap_schedule_not_found",
      }),
    );
  }

  // Atomic: ketiga update (jadwal requester, jadwal target, status swap) dalam satu transaksi DB.
  const { error: rpcError } = await supabase.rpc("approve_shift_swap", {
    p_swap_request_id:      shiftSwapRequestId,
    p_tenant_apotek_id:     active.tenantId,
    p_requester_schedule_id: requesterSchedule.id,
    p_target_schedule_id:   targetSchedule.id,
    p_req_shift_id:         targetSchedule.shift_id,
    p_req_is_off:           targetSchedule.is_off,
    p_tgt_shift_id:         requesterSchedule.shift_id,
    p_tgt_is_off:           requesterSchedule.is_off,
  });
  if (rpcError) {
    console.error("approve_shift_swap RPC failed:", rpcError);
    return redirect(
      adminAttendanceApprovalPath({
        feedback: "error",
        message: "swap_apply_failed",
      }),
    );
  }

  const requesterNext = { shift_id: targetSchedule.shift_id, is_off: targetSchedule.is_off };
  const targetNext    = { shift_id: requesterSchedule.shift_id, is_off: requesterSchedule.is_off };
  await writeAuditLog(supabase, {
    tenantApotekId: active.tenantId,
    actorUserId: session.userId,
    entityType: "shift_swap_request",
    entityId: shiftSwapRequestId,
    action: "shift_swap_approved",
    oldValue: {
      status: swapRequest.status,
      requester_schedule: requesterSchedule,
      target_schedule: targetSchedule,
    },
    newValue: {
      status: "approved",
      admin_note: adminNote || null,
      requester_schedule_after: requesterNext,
      target_schedule_after: targetNext,
      requester_user_id: swapRequest.requester_user_id,
      target_user_id: swapRequest.target_user_id,
      reason: swapRequest.reason,
    },
  });

  revalidatePath("/admin/absensi");
  revalidatePath("/crew/kehadiran");
  return redirect(
    adminAttendanceApprovalPath({
      feedback: "success",
      message: "swap_updated",
      decision: "approved",
    }),
  );
}
