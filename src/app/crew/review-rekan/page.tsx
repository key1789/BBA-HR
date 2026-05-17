import { getSessionContext } from "@/lib/auth-context";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { ReviewRekanClient } from "@/app/crew/review-rekan/review-rekan-client";

export default async function ReviewRekanPage() {
  const session = await getSessionContext();
  const active = session?.activeMembership;

  if (!active || (active.role !== "crew" && active.role !== "admin_apotek")) {
    return redirect("/login");
  }

  const supabase = await createClient();
  const supabaseAdmin = createAdminClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/login");
  }

  const today = new Date();
  const periodMonth = today.getMonth() + 1;
  const periodYear = today.getFullYear();

  // 1. Ambil setting add-on (untuk batasan frekuensi)
  const { data: addonData } = await supabase
    .from("addon_settings")
    .select("settings")
    .eq("tenant_apotek_id", active.tenantId)
    .eq("addon_key", "review_internal")
    .single();

  const settings = (addonData?.settings as any) || {};
  const limitPerMonth = settings.frequency_per_month || 1;

  // 2. Ambil daftar rekan kerja di apotek yang sama (kecuali diri sendiri)
  const { data: membersData } = await supabaseAdmin
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_apotek_id", active.tenantId)
    .eq("is_active", true)
    .in("role", ["crew", "admin_apotek"])
    .neq("user_id", user.id);
  const memberUserIds = Array.from(new Set((membersData || []).map((m: any) => m.user_id).filter(Boolean)));
  const { data: userRows } =
    memberUserIds.length > 0
      ? await supabaseAdmin.from("app_users").select("id, full_name").in("id", memberUserIds)
      : { data: [] as any[] };
  const fullNameById = new Map((userRows || []).map((u: any) => [u.id, u.full_name]));
  const colleagues = memberUserIds.map((id) => ({
    id,
    name: fullNameById.get(id) || "Kru Tanpa Nama",
  }));

  // 3. Ambil riwayat review yang sudah diberikan user bulan ini
  const { data: myReviews } = await supabase
    .from("peer_reviews")
    .select("reviewee_user_id, rating, comment, created_at")
    .eq("reviewer_user_id", user.id)
    .eq("period_month", periodMonth)
    .eq("period_year", periodYear);

  return (
    <section className="space-y-6">
      <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 relative z-20 mb-2">
         <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Review <span className="text-sky-600">Rekan Kerja</span></h1>
         <p className="text-slate-500 text-sm mt-1 font-medium">Beri apresiasi dan masukan positif untuk rekan kerja Anda.</p>
      </div>

      <ReviewRekanClient 
        colleagues={colleagues}
        myReviews={myReviews || []}
        limitPerMonth={limitPerMonth}
      />
    </section>
  );
}
