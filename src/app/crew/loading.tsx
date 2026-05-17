import {
  RouteLoadingBanner,
  TablePageSkeleton,
} from "@/components/shared/route-loading";

export default function CrewLoading() {
  return (
    <div className="mx-auto max-w-3xl">
      <RouteLoadingBanner message="Memuat halaman crew…" />
      <TablePageSkeleton rows={4} />
    </div>
  );
}
