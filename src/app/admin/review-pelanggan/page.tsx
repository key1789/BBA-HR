import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { HelpDrawer } from "@/components/shared/help-drawer";
import { AddonGate } from "@/components/shared/addon-gate";
import { Input } from "@/components/shared/input";
import { FlashMessage } from "@/components/shared/flash-message";
import { readFlashMessage } from "@/lib/flash-message";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { submitCustomerReviewAction } from "./actions";
import { SubmitReviewButton } from "./submit-button";
import { CrewFilter } from "./crew-filter";
import { REVIEW_PELANGGAN_HELP } from "./help-content";
import { Star } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type ReviewRow = {
  id: string;
  user_id: string | null;
  review_text: string | null;
  customer_name: string | null;
  rating: number | null;
  reviewed_at: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const fmtDateTime = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
});

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AdminReviewPelangganPage({
  searchParams,
}: {
  searchParams: Promise<{ karyawan?: string }>;
}) {
  const params = await searchParams;
  const session = await getSessionContext();
  const active = session?.activeMembership;
  const flash = await readFlashMessage();

  if (!active || active.role !== "admin_apotek") {
    return (
      <section className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-slate-500">Halaman ini hanya untuk admin apotek.</p>
      </section>
    );
  }

  const supabase = await createClient();

  // ── Addon guard ──────────────────────────────────────────────────────────
  const { data: addonData } = await supabase
    .from("addon_settings")
    .select("is_enabled")
    .eq("tenant_apotek_id", active.tenantId)
    .eq("addon_key", "review_pelanggan")
    .maybeSingle();

  const addonEnabled = addonData?.is_enabled ?? false;

  // ── Crew list ────────────────────────────────────────────────────────────
  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("user_id, app_users!inner(id, full_name)")
    .eq("tenant_apotek_id", active.tenantId)
    .eq("role", "crew")
    .eq("is_active", true)
    .eq("app_users.is_active", true);

  const crew = (memberships ?? [])
    .map((m) => {
      const user = Array.isArray(m.app_users) ? m.app_users[0] : m.app_users;
      return {
        id: (user as { id: string; full_name: string } | null)?.id ?? m.user_id,
        full_name:
          (user as { id: string; full_name: string } | null)?.full_name ??
          "Tanpa Nama",
      };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "id"));

  // ── Reviews ──────────────────────────────────────────────────────────────
  const selectedCrewId = params.karyawan?.trim() || null;

  let reviewQuery = supabase
    .from("customer_review_logs")
    .select("id, user_id, review_text, customer_name, rating, reviewed_at")
    .eq("tenant_apotek_id", active.tenantId)
    .order("reviewed_at", { ascending: false })
    .limit(50);

  if (selectedCrewId) {
    reviewQuery = reviewQuery.eq("user_id", selectedCrewId);
  }

  const { data: recentReviews } = await reviewQuery;
  const reviews = (recentReviews ?? []) as ReviewRow[];

  // ── Derived stats ─────────────────────────────────────────────────────────
  const crewNameById = new Map(crew.map((c) => [c.id, c.full_name]));
  const reminderWindow = getOperationalReminderWindow();
  // WIB datetime for the datetime-local input default
  const wibNow = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const todayIso = wibNow.toISOString().slice(0, 16);
  const isTruncated = reviews.length === 50;

  const reviewsWithRating = reviews.filter((r) => r.rating !== null);
  const avgRating =
    selectedCrewId && reviewsWithRating.length > 0
      ? reviewsWithRating.reduce((s, r) => s + (r.rating ?? 0), 0) /
        reviewsWithRating.length
      : null;

  const selectedCrewName = selectedCrewId
    ? (crewNameById.get(selectedCrewId) ?? null)
    : null;

  return (
    <section className="space-y-4">
      {/* ── Hero card ── */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-600 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
            <Star size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Review Pelanggan</h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {active.tenantName} · {reminderWindow.dateKey}
            </p>
          </div>
        </div>
      </div>

      <FlashMessage flash={flash} />

      <AddonGate
        enabled={addonEnabled}
        addonName="Review Pelanggan"
        addonKey="review_pelanggan"
        description="Fitur pencatatan ulasan dan feedback pelanggan terhadap karyawan. Data review masuk ke raport bulanan crew sebagai komponen penilaian."
      >

      {/* ── Form Tambah Review ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          Tambah Review Baru
        </h2>

        <div className="rounded-3xl border border-slate-100 bg-white p-5">
          <form action={submitCustomerReviewAction} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Karyawan */}
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Karyawan yang direview{" "}
                  <span className="text-rose-500">*</span>
                </span>
                <select
                  name="user_id"
                  required
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                >
                  <option value="">-- Pilih karyawan --</option>
                  {crew.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </label>

              {/* Nama Pelanggan */}
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Nama Pelanggan
                  <span className="ml-1 font-normal text-slate-400">
                    (opsional)
                  </span>
                </span>
                <Input
                  type="text"
                  name="customer_name"
                  placeholder="Kosongkan jika anonim"
                />
              </label>

              {/* Rating */}
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Rating
                  <span className="ml-1 font-normal text-slate-400">
                    (opsional)
                  </span>
                </span>
                <select
                  name="rating"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
                >
                  <option value="">-- Tanpa rating --</option>
                  <option value="5">⭐⭐⭐⭐⭐ — Sangat Baik (5)</option>
                  <option value="4">⭐⭐⭐⭐ — Baik (4)</option>
                  <option value="3">⭐⭐⭐ — Cukup (3)</option>
                  <option value="2">⭐⭐ — Kurang (2)</option>
                  <option value="1">⭐ — Buruk (1)</option>
                </select>
              </label>

              {/* Waktu Ulasan */}
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                  Waktu Ulasan
                </span>
                <Input
                  type="datetime-local"
                  name="reviewed_at"
                  defaultValue={todayIso}
                />
              </label>
            </div>

            {/* Catatan */}
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">
                Catatan / Ulasan <span className="text-rose-500">*</span>
              </span>
              <textarea
                name="review_text"
                required
                rows={3}
                placeholder="Tulis ulasan atau catatan dari pelanggan..."
                className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </label>

            <div className="flex justify-end">
              <SubmitReviewButton />
            </div>
          </form>
        </div>
      </div>

      {/* ── Riwayat Review ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Header row: judul + filter */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Riwayat Review
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[9px] font-black text-slate-500">
              {reviews.length}
              {isTruncated ? "+" : ""}
            </span>

            {/* Avg rating badge — hanya muncul saat filter aktif & ada rating */}
            {avgRating !== null && (
              <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5 text-[9px] font-black text-amber-600">
                {"★".repeat(Math.round(avgRating))}
                {"☆".repeat(5 - Math.round(avgRating))}{" "}
                {avgRating.toFixed(1)}/5
                <span className="ml-1 font-normal text-amber-500">
                  ({reviewsWithRating.length} rating)
                </span>
              </span>
            )}
          </div>

          <CrewFilter crew={crew} selectedId={selectedCrewId} />
        </div>

        {/* Active filter label */}
        {selectedCrewName && (
          <p className="text-[11px] text-slate-500">
            Menampilkan review untuk{" "}
            <span className="font-bold text-slate-700">{selectedCrewName}</span>
          </p>
        )}

        {/* List */}
        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white">
          {reviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                <Star size={20} className="text-slate-400" />
              </div>
              <p className="text-sm text-slate-500">
                {selectedCrewId
                  ? "Belum ada review untuk karyawan ini."
                  : "Belum ada review pelanggan yang dicatat."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {reviews.map((r) => {
                const crewName = r.user_id
                  ? (crewNameById.get(r.user_id) ?? "Tidak dikenal")
                  : "—";
                const rating = r.rating !== null ? Number(r.rating) : null;

                return (
                  <div
                    key={r.id}
                    className="flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/60"
                  >
                    {/* Initials avatar */}
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-sky-100 text-[11px] font-black text-sky-700">
                      {getInitials(crewName)}
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Top row: nama + dari + rating */}
                      <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-bold text-slate-800">
                          {crewName}
                        </span>
                        {r.customer_name && (
                          <span className="text-xs text-slate-400">
                            dari {r.customer_name}
                          </span>
                        )}
                        {rating !== null && (
                          <span className="rounded-full border border-amber-100 bg-amber-50 px-2.5 py-0.5 text-[9px] font-black text-amber-600">
                            {"★".repeat(rating)}
                            {"☆".repeat(5 - rating)} {rating}/5
                          </span>
                        )}
                      </div>

                      {/* Review text */}
                      <p className="text-sm leading-relaxed text-slate-700">
                        {r.review_text || "—"}
                      </p>

                      {/* Timestamp */}
                      {r.reviewed_at && (
                        <p className="mt-1 text-[11px] text-slate-400">
                          {fmtDateTime.format(new Date(r.reviewed_at))}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Truncation indicator */}
          {isTruncated && (
            <div className="border-t border-slate-100 px-4 py-2.5 text-center">
              <p className="text-[11px] text-slate-400">
                Menampilkan 50 review terbaru.
                {selectedCrewId ? "" : " Gunakan filter per karyawan untuk mempersempit hasil."}
              </p>
            </div>
          )}
        </div>
      </div>

      </AddonGate>

      <HelpDrawer content={REVIEW_PELANGGAN_HELP} />
    </section>
  );
}
