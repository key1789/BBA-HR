import {
  DetailTabsPageSkeleton,
  RouteLoadingBanner,
} from "@/components/shared/route-loading";

export default function BranchDetailLoading() {
  return (
    <div className="mx-auto max-w-[1600px]">
      <RouteLoadingBanner
        message="Memuat detail cabang…"
        subtitle="Data pegawai, KPI, dan payroll"
      />
      <DetailTabsPageSkeleton />
    </div>
  );
}
