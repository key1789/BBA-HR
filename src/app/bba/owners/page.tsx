/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/app-url";
import { AnimatedPage } from "@/components/shared/animated-page";
import { GlassCard } from "@/components/shared/glass-card";
import { AddOwnerButton } from "./add-owner-button";
import { OwnerListClient } from "./owner-list-client";

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
      id, full_name, email, phone, is_active, last_login_at,
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
      last_login_at: user.last_login_at,
      apoteks: apoteks,
      status: "active"
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

  return (
    <AnimatedPage className="space-y-6">
      {/* HEADER PAGE */}
      <GlassCard className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6" variant="light">
        <div>
          <h1 className="text-xl font-black text-slate-800">Kelola Data Owner</h1>
          <p className="text-sm text-slate-500 mt-1">Halaman untuk mendaftarkan dan mengelola akun Pemilik (Owner) Apotek.</p>
        </div>
        <AddOwnerButton />
      </GlassCard>

      {/* CLIENT COMPONENT (SEARCH & TABLE) */}
      <OwnerListClient initialData={filteredDisplayData} />
    </AnimatedPage>
  );
}
