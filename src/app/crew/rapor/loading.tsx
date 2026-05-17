import { RouteLoadingBanner, Skeleton } from "@/components/shared/route-loading";

export default function RaporLoading() {
  return (
    <div className="space-y-6 pb-10">
      <RouteLoadingBanner message="Memuat rapor bulanan…" />
      <Skeleton className="h-20 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Skeleton className="h-48 w-full" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </div>
  );
}
