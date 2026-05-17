import {
  DashboardPageSkeleton,
  RouteLoadingBanner,
} from "@/components/shared/route-loading";

export default function OwnerLoading() {
  return (
    <div className="mx-auto max-w-5xl">
      <RouteLoadingBanner message="Memuat portal owner…" />
      <DashboardPageSkeleton />
    </div>
  );
}
