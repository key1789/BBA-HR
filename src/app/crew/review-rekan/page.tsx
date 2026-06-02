/* eslint-disable @typescript-eslint/no-explicit-any */
import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";
import { AnimatedPage } from "@/components/shared/animated-page";
import { HelpDrawer } from "@/components/shared/help-drawer";
import { ReviewRekanClient } from "@/app/crew/review-rekan/review-rekan-client";
import { REVIEW_REKAN_HELP } from "./help-content";
import { Star } from "lucide-react";

export default async function ReviewRekanPage() {
  const session = await getSessionContext();
  const active = session?.activeMembership;

  if (!active || active.role !== "crew") {
    return redirect("/login");
  }

  const supabase = await createClient();
  const supabaseAdmin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  // Use WIB-authoritative date for period calculation
  const reminderWindow = getOperationalReminderWindow();
  const [periodYear, periodMonth] = reminderWindow.dateKey.split("-").map(Number);

  // 1. Fetch addon settings (for frequency limit)
  const { data: addonData } = await supabase
    .from("addon_settings")
    .select("settings")
    .eq("tenant_apotek_id", active.tenantId)
    .eq("addon_key", "review_internal")
    .maybeSingle();

  const settings = (addonData?.settings as any) || {};
  const limitPerMonth: number = settings.frequency_per_month || 1;

  // 2. Fetch colleagues at this apotek (excluding self)
  const { data: membersData } = await supabaseAdmin
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_apotek_id", active.tenantId)
    .eq("is_active", true)
    .eq("role", "crew")
    .neq("user_id", user.id);

  const memberUserIds = Array.from(
    new Set((membersData || []).map((m: any) => m.user_id).filter(Boolean)),
  );
  const { data: userRows } =
    memberUserIds.length > 0
      ? await supabaseAdmin.from("app_users").select("id, full_name").in("id", memberUserIds)
      : { data: [] as any[] };

  const fullNameById = new Map((userRows || []).map((u: any) => [u.id, u.full_name]));
  const colleagues = memberUserIds.map((id) => ({
    id,
    name: fullNameById.get(id) || "Kru Tanpa Nama",
  }));

  // 3. Fetch reviews already given by this user this month (tenant-filtered for security)
  const { data: myReviews } = await supabase
    .from("peer_reviews")
    .select("reviewee_user_id, rating, comment, created_at")
    .eq("tenant_apotek_id", active.tenantId)
    .eq("reviewer_user_id", user.id)
    .eq("period_month", periodMonth!)
    .eq("period_year", periodYear!);

  return (
    <AnimatedPage className="space-y-4 pb-10">
      {/* Page header */}
      <div className="bg-white rounded-3xl p-5 shadow-md border border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-600 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
            <Star size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">
              Review Rekan Kerja
            </h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {active.tenantCode} · {reminderWindow.dateKey.slice(0, 7)}
            </p>
          </div>
        </div>
      </div>

      <HelpDrawer content={REVIEW_REKAN_HELP} />

      <ReviewRekanClient
        colleagues={colleagues}
        myReviews={myReviews || []}
        limitPerMonth={limitPerMonth}
      />
    </AnimatedPage>
  );
}
