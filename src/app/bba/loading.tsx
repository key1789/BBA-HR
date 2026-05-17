import {
  RouteLoadingBanner,
  TablePageSkeleton,
} from "@/components/shared/route-loading";

export default function BbaLoading() {
  return (
    <div className="mx-auto max-w-[1600px]">
      <RouteLoadingBanner message="Memuat halaman BBA…" />
      <TablePageSkeleton />
    </div>
  );
}
