import {
  DetailTabsPageSkeleton,
  RouteLoadingBanner,
} from "@/components/shared/route-loading";

export default function AuditDetailLoading() {
  return (
    <div className="mx-auto max-w-[1600px]">
      <RouteLoadingBanner
        message="Memuat audit & appraisal…"
        subtitle="Perhitungan KPI dan data verifikasi"
      />
      <DetailTabsPageSkeleton />
    </div>
  );
}
