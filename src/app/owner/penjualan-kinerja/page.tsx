import { AnimatedPage } from "@/components/shared/animated-page";
import { OwnerPenjualanKinerja } from "@/components/owner/owner-penjualan-kinerja";
import { OwnerPortalShell } from "@/components/owner/owner-portal-shell";
import { getOwnerPortalContext } from "@/app/owner/_lib/owner-portal-context";
import { fetchOwnerPenjualanSnapshot } from "@/lib/owner-dashboard-data";
import { Building2 } from "lucide-react";

export default async function OwnerPenjualanKinerjaPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; date?: string; tenant?: string }>;
}) {
  const params = await searchParams;
  const ctxResult = await getOwnerPortalContext(params);
  if (!ctxResult.ok) {
    if (ctxResult.reason === "no_owner") {
      return (
        <AnimatedPage className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 className="h-16 w-16 text-slate-300 mb-4" />
          <h1 className="text-xl font-black text-slate-800 uppercase">Belum ada cabang</h1>
          <p className="text-slate-500 mt-2">Akun Anda belum ditugaskan sebagai owner apotek manapun.</p>
        </AnimatedPage>
      );
    }
    return <p className="text-sm text-slate-600">Halaman ini khusus owner.</p>;
  }

  const { data: ctx } = ctxResult;
  const penjualanSnapshot = await fetchOwnerPenjualanSnapshot(
    ctx.supabase,
    ctx.activeOwnerMembership.tenantId,
    ctx.month,
    ctx.year,
  );

  return (
    <AnimatedPage>
      <OwnerPortalShell
        ctx={ctx}
        basePath="/owner/penjualan-kinerja"
        title={
          <>
            Penjualan & <span className="text-amber-600">kinerja</span>
          </>
        }
      >
        <OwnerPenjualanKinerja snapshot={penjualanSnapshot} />
      </OwnerPortalShell>
    </AnimatedPage>
  );
}
