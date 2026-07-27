/* eslint-disable @typescript-eslint/no-explicit-any */
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { AnimatedPage } from "@/components/shared/animated-page";
import { FlashMessage } from "@/components/shared/flash-message";
import { readFlashMessage } from "@/lib/flash-message";
import { UserCog } from "lucide-react";
import { AdminClosingForm } from "./admin-closing-form";

// Mode "Admin Penuh": admin mencatat closingan atas nama tiap crew, langsung sah.
// Bila apotek masih mode "berjenjang", admin cukup memverifikasi → halaman ini tidak dipakai.
export default async function AdminInputHarianPage() {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!active || active.role !== "admin_apotek") {
    redirect("/admin/dashboard");
  }

  const supabase = await createClient();
  const supabaseAdmin = createAdminClient();

  // Gate: hanya untuk apotek bermode admin_full.
  const { data: tenant } = await supabase
    .from("tenant_apotek")
    .select("closing_mode")
    .eq("id", active.tenantId)
    .maybeSingle();
  if (tenant?.closing_mode !== "admin_full") {
    redirect("/admin/verifikasi");
  }

  const flash = await readFlashMessage();

  const reminderWindow = getOperationalReminderWindow();
  const [periodYear, periodMonth] = reminderWindow.dateKey.split("-").map(Number);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const startDate = `${periodYear}-${pad2(periodMonth!)}-01`;
  const endDate = `${periodYear}-${pad2(periodMonth!)}-${new Date(periodYear!, periodMonth!, 0).getDate()}`;

  const [
    { data: crewMemberships },
    { data: shiftsData },
    { data: addonData },
    { data: focusConfigs },
    { data: submissionsData },
  ] = await Promise.all([
    supabaseAdmin
      .from("tenant_memberships")
      .select("user_id, app_users!inner (id, full_name, is_active)")
      .eq("tenant_apotek_id", active.tenantId)
      .eq("role", "crew")
      .eq("is_active", true),

    supabase
      .from("master_shifts")
      .select("id, shift_name")
      .eq("tenant_apotek_id", active.tenantId)
      .eq("is_active", true)
      .order("start_time", { ascending: true }),

    supabase
      .from("addon_settings")
      .select("is_enabled")
      .eq("tenant_apotek_id", active.tenantId)
      .eq("addon_key", "produk_fokus")
      .maybeSingle(),

    supabaseAdmin
      .from("product_fokus_configs")
      .select("product_id, master_products (product_name)")
      .eq("tenant_apotek_id", active.tenantId)
      .eq("period_month", periodMonth)
      .eq("period_year", periodYear),

    supabaseAdmin
      .from("daily_submissions")
      .select("id, user_id, submission_date, shift_label, omzet_total, transaction_total, product_total, rejected_customer_total, rejected_medicine_total, status")
      .eq("tenant_apotek_id", active.tenantId)
      .gte("submission_date", startDate)
      .lte("submission_date", endDate)
      .order("submission_date", { ascending: false }),
  ]);

  const crews = (crewMemberships ?? [])
    .map((m: any) => {
      const u = Array.isArray(m.app_users) ? m.app_users[0] : m.app_users;
      return u?.id ? { id: u.id, full_name: u.full_name as string } : null;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.full_name.localeCompare(b.full_name, "id")) as { id: string; full_name: string }[];

  const shifts = (shiftsData ?? []) as { id: string; shift_name: string }[];
  const addonProdukFokusEnabled = addonData?.is_enabled ?? false;

  const focusProducts = (focusConfigs ?? []).map((c: any) => ({
    product_id: c.product_id as string,
    product_name: (Array.isArray(c.master_products) ? c.master_products[0]?.product_name : c.master_products?.product_name) ?? "Produk",
  }));

  const submissions = (submissionsData ?? []) as any[];

  // Ambil produk fokus per submission (untuk log & muat-edit).
  const submissionIds = submissions.map((s) => s.id);
  let focusBySubmission: Record<string, Array<{ product_id: string; product_name: string; quantity_sold: number }>> = {};
  if (submissionIds.length > 0) {
    const { data: focusRows } = await supabaseAdmin
      .from("daily_submission_products")
      .select("submission_id, product_id, quantity_sold, master_products (product_name)")
      .in("submission_id", submissionIds);
    focusBySubmission = (focusRows ?? []).reduce((acc: any, r: any) => {
      (acc[r.submission_id] ??= []).push({
        product_id: r.product_id,
        product_name: (Array.isArray(r.master_products) ? r.master_products[0]?.product_name : r.master_products?.product_name) ?? "Produk",
        quantity_sold: Number(r.quantity_sold),
      });
      return acc;
    }, {});
  }

  const crewNameById = new Map(crews.map((c) => [c.id, c.full_name]));
  const recentSubmissions = submissions.map((s) => ({
    id: s.id,
    user_id: s.user_id,
    crew_name: crewNameById.get(s.user_id) ?? "—",
    submission_date: s.submission_date,
    shift_label: s.shift_label,
    omzet_total: Number(s.omzet_total),
    transaction_total: Number(s.transaction_total),
    product_total: Number(s.product_total),
    rejected_customer_total: Number(s.rejected_customer_total),
    rejected_medicine_total: Number(s.rejected_medicine_total),
    status: s.status,
    focus_items: focusBySubmission[s.id] ?? [],
  }));

  return (
    <AnimatedPage>
      <FlashMessage flash={flash} />
      <div className="mb-5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-2xl bg-sky-600 flex items-center justify-center shrink-0">
          <UserCog size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-black text-slate-800 leading-tight">Input Closingan</h1>
          <p className="text-[11px] font-bold text-slate-400">Catat closingan atas nama crew — langsung sah tanpa verifikasi.</p>
        </div>
      </div>

      <AdminClosingForm
        crews={crews}
        shifts={shifts}
        addonProdukFokusEnabled={addonProdukFokusEnabled}
        focusProducts={focusProducts}
        recentSubmissions={recentSubmissions}
        todayDateKey={reminderWindow.dateKey}
      />
    </AnimatedPage>
  );
}
