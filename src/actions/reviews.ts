"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth-context";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { revalidatePath } from "next/cache";

type PeerReviewInput = {
  revieweeId: string;
  rating: number;
  comment: string;
};

export async function submitPeerReviewAction(input: PeerReviewInput) {
  const session = await getSessionContext();
  const active = session?.activeMembership;

  // Only crew role can submit reviews
  if (!session?.userId || !active?.tenantId || active.role !== "crew") {
    return { success: false, error: "Akses ditolak." };
  }

  const reviewerId = session.userId;

  // Self-review prevention
  if (input.revieweeId === reviewerId) {
    return { success: false, error: "Tidak dapat memberikan penilaian untuk diri sendiri." };
  }

  // Rating validation
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { success: false, error: "Rating harus berupa bilangan bulat antara 1 sampai 5." };
  }

  // Use server-side WIB date for period (never trust client)
  const reminderWindow = getOperationalReminderWindow();
  const [periodYear, periodMonth] = reminderWindow.dateKey.split("-").map(Number);

  const supabase = await createClient();
  const tenantId = active.tenantId;

  // Server-side frequency limit check
  const { data: addonData } = await supabase
    .from("addon_settings")
    .select("settings")
    .eq("tenant_apotek_id", tenantId)
    .eq("addon_key", "review_internal")
    .maybeSingle();

  const settings = ((addonData?.settings as Record<string, unknown>) || {});
  const limitPerMonth: number = (typeof settings.frequency_per_month === "number"
    ? settings.frequency_per_month
    : 1);

  const { count: existingCount } = await supabase
    .from("peer_reviews")
    .select("id", { count: "exact", head: true })
    .eq("tenant_apotek_id", tenantId)
    .eq("reviewer_user_id", reviewerId)
    .eq("period_month", periodMonth!)
    .eq("period_year", periodYear!);

  if ((existingCount ?? 0) >= limitPerMonth) {
    return { success: false, error: "Kuota penilaian bulan ini sudah habis." };
  }

  const { error } = await supabase
    .from("peer_reviews")
    .insert({
      tenant_apotek_id: tenantId,
      reviewer_user_id: reviewerId,
      reviewee_user_id: input.revieweeId,
      rating: input.rating,
      comment: input.comment,
      period_month: periodMonth,
      period_year: periodYear,
    });

  if (error) {
    console.error("Failed to submit peer review:", error);
    if (error.code === "23505") {
      return { success: false, error: "Anda sudah memberikan penilaian untuk rekan ini bulan ini." };
    }
    return { success: false, error: "Gagal menyimpan penilaian." };
  }

  revalidatePath("/crew/review-rekan");
  return { success: true };
}
