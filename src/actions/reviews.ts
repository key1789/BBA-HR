"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth-context";
import { revalidatePath } from "next/cache";

type PeerReviewInput = {
  revieweeId: string;
  rating: number;
  comment: string;
  periodMonth?: number;
  periodYear?: number;
};

export async function submitPeerReviewAction(input: PeerReviewInput) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!session?.userId || !active?.tenantId || (active.role !== "crew" && active.role !== "admin_apotek")) {
    return { success: false, error: "Akses ditolak." };
  }

  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { success: false, error: "Rating harus berupa bilangan bulat antara 1 sampai 5." };
  }

  const now = new Date();
  const tenantId = active.tenantId;
  const reviewerId = session.userId;
  const periodMonth = input.periodMonth ?? now.getMonth() + 1;
  const periodYear = input.periodYear ?? now.getFullYear();

  const supabase = await createClient();

  const { error } = await supabase
    .from("peer_reviews")
    .insert({
      tenant_apotek_id: tenantId,
      reviewer_user_id: reviewerId,
      reviewee_user_id: input.revieweeId,
      rating: input.rating,
      comment: input.comment,
      period_month: periodMonth,
      period_year: periodYear
    });

  if (error) {
    console.error("Failed to submit peer review:", error);
    if (error.code === '23505') {
       return { success: false, error: "Anda sudah memberikan penilaian untuk rekan ini bulan ini." };
    }
    return { success: false, error: "Gagal menyimpan penilaian." };
  }

  revalidatePath("/crew/review-rekan");
  return { success: true };
}
