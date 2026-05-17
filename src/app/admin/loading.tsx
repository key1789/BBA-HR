import {
  RouteLoadingBanner,
  TablePageSkeleton,
} from "@/components/shared/route-loading";

export default function AdminLoading() {
  return (
    <div className="mx-auto max-w-3xl">
      <RouteLoadingBanner message="Memuat halaman admin…" />
      <TablePageSkeleton rows={5} />
    </div>
  );
}
