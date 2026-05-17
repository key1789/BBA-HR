/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { CrewInputForm } from "./crew-input-form";
import { AnimatedPage } from "@/components/shared/animated-page";

export default async function CrewInputHarianPage() {
  const session = await getSessionContext();
  const active = session?.activeMembership;

  if (!active || (active.role !== "crew" && active.role !== "admin_apotek")) {
    return (
      <AnimatedPage className="flex items-center justify-center py-20">
        <p className="text-sm text-slate-500 font-bold">Halaman ini hanya untuk crew atau admin apotek.</p>
      </AnimatedPage>
    );
  }

  const supabase = await createClient();
  const supabaseAdmin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Use WIB date for period calculation
  const reminderWindow = getOperationalReminderWindow();
  const [periodYear, periodMonth] = reminderWindow.dateKey.split("-").map(Number);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const startDate = `${periodYear}-${pad2(periodMonth!)}-01`;
  const endDate   = `${periodYear}-${pad2(periodMonth!)}-${new Date(periodYear!, periodMonth!, 0).getDate()}`;

  const [
    { data: recentSubmissionsData },
    { data: shiftsData },
    { data: addonData },
  ] = await Promise.all([
    supabase
      .from("daily_submissions")
      .select("id, submission_date, shift_label, omzet_total, transaction_total, product_total, rejected_customer_total, late_reason, status")
      .eq("tenant_apotek_id", active.tenantId)
      .eq("user_id", user?.id ?? "")
      .gte("submission_date", startDate)
      .lte("submission_date", endDate)
      .order("submission_date", { ascending: false })
      .order("created_at", { ascending: false }),

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
  ]);

  const recentSubmissions = (recentSubmissionsData ?? []) as any[];
  const shifts = shiftsData ?? [];
  const addonProdukFokusEnabled = addonData?.is_enabled ?? false;

  // Focus products (only if addon active)
  let focusProducts: any[] = [];
  if (addonProdukFokusEnabled) {
    const { data: configData } = await supabase
      .from("product_fokus_configs")
      .select("product_id")
      .eq("tenant_apotek_id", active.tenantId)
      .eq("period_month", periodMonth!)
      .eq("period_year", periodYear!);

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
        product_name: nameById.get(productId) ?? "Produk",
      }));
    }
  }

  // Attach focus product details to each submission
  const submissionIds = recentSubmissions.map((s: any) => s.id).filter(Boolean);
  const { data: submissionProducts } =
    submissionIds.length > 0
      ? await supabase
          .from("daily_submission_products")
          .select("submission_id, product_id, quantity_sold")
          .in("submission_id", submissionIds)
      : { data: [] as any[] };

  const focusNameById = new Map((focusProducts).map((fp: any) => [fp.product_id, fp.product_name]));
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

  const recentSubmissionsWithDetails = recentSubmissions.map((row: any) => ({
    ...row,
    focus_items: productBySubmission.get(row.id) ?? [],
  }));

  return (
    <AnimatedPage className="space-y-4 pb-10">
      <CrewInputForm
        shifts={shifts}
        addonProdukFokusEnabled={addonProdukFokusEnabled}
        focusProducts={focusProducts}
        recentSubmissions={recentSubmissionsWithDetails}
      />
    </AnimatedPage>
  );
}
