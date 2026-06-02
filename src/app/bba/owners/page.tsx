/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/app-url";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { AddOwnerButton } from "./add-owner-button";
import { OwnerListClient } from "./owner-list-client";
import { ShieldCheck, Users, Clock } from "lucide-react";

async function fetchAuthMetadataOwnerIds(admin: ReturnType<typeof createAdminClient>): Promise<string[]> {
  const ids: string[] = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) break;
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.user_metadata?.role === "owner") ids.push(u.id);
    }
    if (users.length < perPage) break;
    page += 1;
  }
  return ids;
}

export default async function OwnersPage({
  searchParams,
}: {
  searchParams: Promise<{ ownerId?: string; tenantId?: string }>;
}) {
  const { ownerId, tenantId } = await searchParams;
  const supabaseAdmin = createAdminClient();

  // 1. Fetch owner IDs from memberships.
  let assignedOwnersQuery = supabaseAdmin
    .from("tenant_memberships")
    .select("user_id")
    .eq("role", "owner");
  if (tenantId) {
    assignedOwnersQuery = assignedOwnersQuery.eq("tenant_apotek_id", tenantId);
  }
  const { data: assignedOwners } = await assignedOwnersQuery;
  const assignedOwnerIds = assignedOwners?.map(m => m.user_id) || [];

  // 2. Include owner candidates from Auth only in global owner management.
  let allOwnerIds = Array.from(new Set(assignedOwnerIds));
  if (!tenantId) {
    const metadataOwnerIds = await fetchAuthMetadataOwnerIds(supabaseAdmin);
    allOwnerIds = Array.from(new Set([...allOwnerIds, ...metadataOwnerIds]));
  }

  // 3. Fetch data lengkap dari app_users
  const { data: appUsersData } =
    allOwnerIds.length > 0
      ? await supabaseAdmin
          .from("app_users")
          .select(`
      id, full_name, email, phone, is_active, is_demo, last_login_at,
      tenant_memberships(
        role,
        tenant_apotek(name)
      )
    `)
          .in("id", allOwnerIds)
      : { data: [] as any[] };

  // 4. Fetch Invitations only on global owner page.
  const { data: invitations } = tenantId
    ? { data: [] as any[] }
    : await supabaseAdmin
      .from("owner_invitations")
      .select("*")
      .order("created_at", { ascending: false });

  // 5. Format data for display
  const ownersData = appUsersData?.map((user: any) => {
    const apoteks =
      user.tenant_memberships
        ?.filter((m: any) => m.role === "owner" && m.tenant_apotek?.name)
        .map((m: any) => m.tenant_apotek.name) || [];

    return {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      is_active: user.is_active,
      is_demo: user.is_demo ?? false,
      last_login_at: user.last_login_at,
      apoteks: apoteks,
      status: "active",
    };
  }) || [];

  const baseUrl = getAppUrl();
  const inviteData = (invitations || []).map((inv) => ({
    id: inv.id,
    full_name: inv.full_name,
    email: inv.email,
    phone: null,
    is_active: false,
    last_login_at: null,
    apoteks: [],
    status: inv.status,
    token: inv.token,
    inviteLink: inv.token ? `${baseUrl}/accept-invitation/${inv.token}` : null,
  }));

  const displayData = [...ownersData, ...inviteData.filter(i => i.status !== 'accepted')];
  const filteredDisplayData = ownerId
    ? displayData.filter((owner: any) => owner.id === ownerId)
    : displayData;

  // Quick stats (dari data penuh, bukan filteredDisplayData)
  const nonDemoOwners = ownersData.filter((o: any) => !o.is_demo);
  const statTotal   = nonDemoOwners.length;
  const statActive  = nonDemoOwners.filter((o: any) => o.is_active).length;
  const statPending = inviteData.filter((i: any) => i.status !== "accepted").length;

  return (
    <AnimatedPage className="space-y-6">
      {/* HEADER PAGE */}
      <GlassCard className="p-4 sm:p-5" variant="light">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-sky-600/25">
              <ShieldCheck size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase leading-tight">
                Kelola Data Owner
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">Daftarkan dan kelola akun Pemilik (Owner) Apotek.</p>
            </div>
          </div>
          <div className="shrink-0">
            <AddOwnerButton />
          </div>
        </div>
      </GlassCard>

      {/* QUICK STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <GlassCard className="p-3.5 border-l-4 border-l-sky-500" variant="light">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
              <Users size={18} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total Owner</p>
              <p className="text-2xl font-black text-slate-900 leading-none">{statTotal}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 border-l-4 border-l-emerald-500" variant="light">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <ShieldCheck size={18} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Owner Aktif</p>
              <p className="text-2xl font-black text-slate-900 leading-none">{statActive}</p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-3.5 border-l-4 border-l-amber-400" variant="light">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0">
              <Clock size={18} />
            </div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Menunggu Verifikasi</p>
              <p className="text-2xl font-black text-slate-900 leading-none">{statPending}</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* CLIENT COMPONENT */}
      <OwnerListClient initialData={filteredDisplayData} />
    </AnimatedPage>
  );
}
