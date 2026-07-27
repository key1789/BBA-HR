import {
  DashboardPageSkeleton,
  RouteLoadingBanner,
} from "@/components/shared/route-loading";

export default function BbaDashboardLoading() {
  return (
    <div className="mx-auto max-w-[1600px]">
      <RouteLoadingBanner
        message="Memuat dashboard…"
        subtitle="Mengambil data cabang dan kinerja"
      />
      <DashboardPageSkeleton />
    </div>
  );
}
