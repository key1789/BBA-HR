"use server";

import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { setFlashMessage } from "@/lib/flash-message";
import { redirect } from "next/navigation";

export async function submitCustomerReviewAction(formData: FormData) {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "admin_apotek") {
    await setFlashMessage({ status: "error", message: "Hanya admin apotek yang dapat menginput review pelanggan." });
    redirect("/admin/review-pelanggan");
  }

  const userId = (formData.get("user_id") as string | null)?.trim();
  const reviewText = (formData.get("review_text") as string | null)?.trim();
  const customerName = (formData.get("customer_name") as string | null)?.trim() || null;
  const ratingRaw = formData.get("rating");
  const rating = ratingRaw ? Number(ratingRaw) : null;
  const reviewedAt = (formData.get("reviewed_at") as string | null) || new Date().toISOString();

  if (!userId) {
    await setFlashMessage({ status: "error", message: "Pilih karyawan yang mendapat review." });
    redirect("/admin/review-pelanggan");
  }
  if (!reviewText) {
    await setFlashMessage({ status: "error", message: "Isi ulasan / catatan dari pelanggan." });
    redirect("/admin/review-pelanggan");
  }
  if (rating !== null && (rating < 1 || rating > 5)) {
    await setFlashMessage({ status: "error", message: "Rating harus antara 1–5." });
    redirect("/admin/review-pelanggan");
  }
  // Validasi format tanggal
  if (isNaN(Date.parse(reviewedAt))) {
    await setFlashMessage({ status: "error", message: "Format waktu ulasan tidak valid." });
    redirect("/admin/review-pelanggan");
  }

  const supabase = await createClient();

  // Verifikasi bahwa userId adalah karyawan aktif di tenant yang sama (anti cross-tenant injection)
  const { data: memberCheck } = await supabase
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_apotek_id", active.tenantId)
    .eq("user_id", userId)
    .eq("is_active", true)
    .in("role", ["crew", "admin_apotek"])
    .maybeSingle();

  if (!memberCheck) {
    await setFlashMessage({ status: "error", message: "Karyawan tidak ditemukan atau tidak aktif di apotek ini." });
    redirect("/admin/review-pelanggan");
  }

  const { error: dbError } = await supabase.from("customer_review_logs").insert({
    tenant_apotek_id: active.tenantId,
    user_id: userId,
    review_text: reviewText,
    customer_name: customerName,
    rating,
    reviewed_at: reviewedAt,
  });

  if (dbError) {
    await setFlashMessage({ status: "error", message: `Gagal menyimpan: ${dbError.message}` });
    redirect("/admin/review-pelanggan");
  }

  await setFlashMessage({ status: "success", message: "Review pelanggan berhasil disimpan." });
  redirect("/admin/review-pelanggan");
}
