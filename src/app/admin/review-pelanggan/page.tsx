import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/shared/card";
import { Button } from "@/components/shared/button";
import { Input } from "@/components/shared/input";
import { AnimatedPage } from "@/components/shared/animated-page";
import { FlashMessage } from "@/components/shared/flash-message";
import { readFlashMessage } from "@/lib/flash-message";
import { submitCustomerReviewAction } from "./actions";
import { Star, UserCircle2 } from "lucide-react";

export default async function AdminReviewPelangganPage() {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  const flash = await readFlashMessage();

  if (!active || active.role !== "admin_apotek") {
    return (
      <AnimatedPage className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-slate-500">Halaman ini hanya untuk admin apotek.</p>
      </AnimatedPage>
    );
  }

  const supabase = await createClient();

  // Fetch active crew for this tenant
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
      return { id: (user as { id: string; full_name: string } | null)?.id ?? m.user_id, full_name: (user as { id: string; full_name: string } | null)?.full_name ?? "Tanpa Nama" };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "id"));

  // Fetch recent reviews for this tenant (last 50)
  const { data: recentReviews } = await supabase
    .from("customer_riview_logs")
    .select("*")
    .eq("tenant_apotek_id", active.tenantId)
    .order("reviewed_at", { ascending: false })
    .limit(50);

  const crewNameById = new Map(crew.map((c) => [c.id, c.full_name]));
  const fmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" });
  const todayIso = new Date().toISOString().slice(0, 16);

  return (
    <AnimatedPage className="space-y-6 pb-10">
      <PageHeader
        title="Review Pelanggan"
        subtitle="Catat ulasan atau feedback pelanggan untuk setiap karyawan."
      />

      <FlashMessage flash={flash} />

      {/* FORM INPUT */}
      <Card className="rounded-3xl p-6 shadow-sm">
        <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4">
          Tambah Review Baru
        </h2>
        <form action={submitCustomerReviewAction} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block text-sm text-slate-700">
              <span className="font-semibold">
                Karyawan yang direview <span className="text-rose-500">*</span>
              </span>
              <select
                name="user_id"
                required
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="">-- Pilih karyawan --</option>
                {crew.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm text-slate-700">
              <span className="font-semibold">Nama Pelanggan</span>
              <Input type="text" name="customer_name" placeholder="Opsional" className="mt-1" />
            </label>

            <label className="block text-sm text-slate-700">
              <span className="font-semibold">Rating (1–5)</span>
              <select
                name="rating"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              >
                <option value="">-- Tidak ada rating --</option>
                <option value="5">⭐⭐⭐⭐⭐ — Sangat Baik (5)</option>
                <option value="4">⭐⭐⭐⭐ — Baik (4)</option>
                <option value="3">⭐⭐⭐ — Cukup (3)</option>
                <option value="2">⭐⭐ — Kurang (2)</option>
                <option value="1">⭐ — Buruk (1)</option>
              </select>
            </label>

            <label className="block text-sm text-slate-700">
              <span className="font-semibold">Waktu Ulasan</span>
              <Input
                type="datetime-local"
                name="reviewed_at"
                defaultValue={todayIso}
                className="mt-1"
              />
            </label>
          </div>

          <label className="block text-sm text-slate-700">
            <span className="font-semibold">
              Catatan / Ulasan <span className="text-rose-500">*</span>
            </span>
            <textarea
              name="review_text"
              required
              rows={3}
              placeholder="Tulis ulasan atau catatan dari pelanggan..."
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
            />
          </label>

          <div className="flex justify-end">
            <Button type="submit" className="gap-2">
              <Star size={14} /> Simpan Review
            </Button>
          </div>
        </form>
      </Card>

      {/* RIWAYAT REVIEW */}
      <Card className="rounded-3xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-widest">
            Riwayat Review ({recentReviews?.length ?? 0} terakhir)
          </h2>
        </div>
        {!recentReviews || recentReviews.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <Star size={20} className="text-slate-400" />
            </div>
            <p className="text-sm text-slate-500">Belum ada review pelanggan yang dicatat.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {(recentReviews as Record<string, unknown>[]).map((r, idx) => {
              const crewId = (r.user_id ?? r.tagged_user_id) as string | null;
              const crewName = crewId ? (crewNameById.get(crewId) ?? "Tidak dikenal") : "—";
              const reviewText = (r.review_text ?? r.comment ?? "") as string;
              const rating = r.rating ? Number(r.rating) : null;
              const customerName = (r.customer_name ?? r.reviewer_name ?? r.source_name ?? null) as string | null;
              const eventTs = (r.reviewed_at ?? r.created_at) as string | null;
              return (
                <div
                  key={idx}
                  className="px-5 py-4 flex gap-4 items-start hover:bg-slate-50/50 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <UserCircle2 size={18} className="text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="text-sm font-bold text-slate-800">{crewName}</span>
                      {customerName && (
                        <span className="text-xs text-slate-500">dari {customerName}</span>
                      )}
                      {rating !== null && (
                        <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                          {"★".repeat(rating)}
                          {"☆".repeat(5 - rating)} {rating}/5
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed">{reviewText || "—"}</p>
                    {eventTs && (
                      <p className="text-[11px] text-slate-400 mt-1">
                        {fmt.format(new Date(eventTs))}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </AnimatedPage>
  );
}
