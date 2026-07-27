import { createAdminClient } from "@/lib/supabase/admin";
import { AnimatedPage } from "@/components/shared/animated-page";
import { BranchOnboardingWizard } from "./wizard";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function NewBranchPage({
  searchParams,
}: {
  searchParams: Promise<{ ownerId?: string }>;
}) {
  const { ownerId: preselectedOwnerId } = await searchParams;
  const supabaseAdmin = createAdminClient();

  // Owners: sumber tunggal app_users.is_owner (mencakup owner yang belum di-assign ke apotek).
  const { data: ownerRows } = await supabaseAdmin
    .from("app_users")
    .select("id")
    .eq("is_owner", true);
  const allOwnerIds = ((ownerRows ?? []) as { id: string }[]).map((r) => r.id);

  const { data: ownerProfiles } = await supabaseAdmin
    .from("app_users")
    .select("id, full_name")
    .in("id", allOwnerIds)
    .eq("is_active", true)
    .eq("is_demo", false)
    .order("full_name");

  const owners = ownerProfiles || [];

  return (
    <AnimatedPage className="max-w-2xl mx-auto space-y-6 pb-16">
      <div className="flex items-center gap-3">
        <Link
          href="/sa/branches"
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ChevronLeft size={16} /> Daftar Apotek
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-black text-slate-800">Daftarkan Apotek Baru</h1>
        <p className="text-sm text-slate-500 mt-1">
          Isi data apotek, akun admin, dan daftar staf — semua link aktivasi akan tersedia di akhir.
        </p>
      </div>

      <BranchOnboardingWizard owners={owners} preselectedOwnerId={preselectedOwnerId} />
    </AnimatedPage>
  );
}
