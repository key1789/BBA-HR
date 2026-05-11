/* eslint-disable @typescript-eslint/no-explicit-any */
import { PageHeader } from "@/components/shared/page-header";
import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CrewInputForm } from "./crew-input-form";

export default async function CrewInputHarianPage({
  searchParams,
}: {
  searchParams: Promise<{ feedback?: string; message?: string }>;
}) {
  const params = await searchParams;
  const session = await getSessionContext();
  const active = session?.activeMembership;

  if (!active || (active.role !== "crew" && active.role !== "admin_apotek")) {
    return (
      <section className="space-y-4">
        <PageHeader
          title="Crew - Input Harian"
          subtitle="Halaman ini hanya untuk crew/admin apotek."
        />
      </section>
    );
  }

  const supabase = await createClient();
  const supabaseAdmin = createAdminClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const now = new Date();
  const periodMonth = now.getMonth() + 1;
  const periodYear = now.getFullYear();
  const startDate = `${periodYear}-${String(periodMonth).padStart(2, "0")}-01`;
  const endDate = `${periodYear}-${String(periodMonth).padStart(2, "0")}-${String(
    new Date(periodYear, periodMonth, 0).getDate(),
  ).padStart(2, "0")}`;

  // 1. Ambil log riwayat input bulan berjalan (semua field utama)
  const { data: recentSubmissionsData } = await supabase
    .from("daily_submissions")
    .select(
      "id, submission_date, shift_label, omzet_total, transaction_total, product_total, rejected_customer_total, late_reason, status",
    )
    .eq("tenant_apotek_id", active.tenantId)
    .eq("user_id", user?.id ?? "")
    .gte("submission_date", startDate)
    .lte("submission_date", endDate)
    .order("submission_date", { ascending: false })
    .order("created_at", { ascending: false });
  
  const recentSubmissions = (recentSubmissionsData ?? []) as any[];

  // 2. Ambil master_shifts
  const { data: shiftsData } = await supabase
    .from("master_shifts")
    .select("id, shift_name")
    .eq("tenant_apotek_id", active.tenantId)
    .eq("is_active", true)
    .order("start_time", { ascending: true });
  
  const shifts = shiftsData ?? [];

  // 3. Cek Addon Produk Fokus
  const { data: addonData } = await supabase
    .from("addon_settings")
    .select("is_enabled")
    .eq("tenant_apotek_id", active.tenantId)
    .eq("addon_key", "produk_fokus")
    .maybeSingle();
  
  const addonProdukFokusEnabled = addonData?.is_enabled ?? false;

  // 4. Ambil Produk Fokus (jika addon aktif) untuk periode bulan berjalan
  let focusProducts: any[] = [];
  if (addonProdukFokusEnabled) {
    // Query config terlebih dulu; nama produk di-resolve terpisah agar tidak blank jika nested join kena RLS.
    const { data: configData } = await supabase
      .from("product_fokus_configs")
      .select("product_id")
      .eq("tenant_apotek_id", active.tenantId)
      .eq("period_month", periodMonth)
      .eq("period_year", periodYear);

    const productIds = Array.from(
      new Set((configData ?? []).map((row: any) => row.product_id).filter(Boolean)),
    );

    if (productIds.length > 0) {
      const { data: productRows } = await supabaseAdmin
        .from("master_products")
        .select("id, product_name")
        .in("id", productIds);

      const nameById = new Map((productRows ?? []).map((p) => [p.id, p.product_name]));
      focusProducts = productIds.map((productId) => ({
        product_id: productId,
        product_name: nameById.get(productId) ?? "Produk Unknown",
      }));
    }
  }

  // 4b. Lengkapi detail produk fokus yang diinput pada tiap laporan bulan berjalan
  const submissionIds = (recentSubmissions ?? []).map((s: any) => s.id).filter(Boolean);
  const { data: submissionProducts } =
    submissionIds.length > 0
      ? await supabase
          .from("daily_submission_products")
          .select("submission_id, product_id, quantity_sold")
          .in("submission_id", submissionIds)
      : { data: [] as any[] };
  const focusNameById = new Map((focusProducts ?? []).map((fp: any) => [fp.product_id, fp.product_name]));
  const productBySubmission = new Map<string, any[]>();
  for (const row of submissionProducts ?? []) {
    const prev = productBySubmission.get(row.submission_id) ?? [];
    prev.push({
      product_id: row.product_id,
      product_name: focusNameById.get(row.product_id) ?? "Produk",
      quantity_sold: Number(row.quantity_sold ?? 0),
    });
    productBySubmission.set(row.submission_id, prev);
  }
  const recentSubmissionsWithDetails = (recentSubmissions ?? []).map((row: any) => ({
    ...row,
    focus_items: productBySubmission.get(row.id) ?? [],
  }));

  // 5. Handle Feedback
  const feedbackStatus = params.feedback === "success" || params.feedback === "error" ? params.feedback : null;
  const feedbackMessageMap: Record<string, string> = {
    draft_saved: "Draft berhasil disimpan.",
    submission_submitted: "Laporan harian berhasil dikirim untuk verifikasi.",
    submission_updated: "Laporan berhasil diperbarui.",
    invalid_input: "Input tidak valid. Mohon periksa kembali kolom isian.",
    user_not_found: "Sesi user tidak ditemukan. Silakan login ulang.",
    save_failed: "Gagal menyimpan laporan. Coba lagi beberapa saat.",
    focus_save_failed: "Laporan utama tersimpan, tetapi detail produk fokus gagal tersimpan. Coba simpan ulang.",
    approved_locked: "Laporan sudah disetujui, tidak bisa diubah dari portal crew.",
    duplicate_exists: "Tanggal + shift ini sudah punya laporan. Gunakan tombol Edit pada log jika ingin mengubah.",
  };
  const feedbackMessage = feedbackStatus && params.message
    ? feedbackMessageMap[params.message] ?? "Aksi selesai."
    : null;

  return (
    <section className="space-y-4">
      <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 relative z-20 mb-2">
         <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Input <span className="text-sky-600">Harian</span></h1>
         <p className="text-slate-500 text-sm mt-1 font-medium">Input metrik penjualan dan laporan shift dengan cepat.</p>
      </div>

      <CrewInputForm 
        shifts={shifts}
        addonProdukFokusEnabled={addonProdukFokusEnabled}
        focusProducts={focusProducts}
        recentSubmissions={recentSubmissionsWithDetails}
        feedbackState={feedbackStatus && feedbackMessage ? { status: feedbackStatus, message: feedbackMessage } : null}
      />
    </section>
  );
}
