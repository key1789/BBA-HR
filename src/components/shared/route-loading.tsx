import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function RouteLoadingBanner({
  message = "Memuat halaman…",
  subtitle,
}: {
  message?: string;
  subtitle?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-6 flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/90 px-4 py-3 shadow-sm"
    >
      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-indigo-600" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-indigo-900">{message}</p>
        {subtitle ? <p className="mt-0.5 text-xs text-indigo-700/80">{subtitle}</p> : null}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-slate-200/70", className)} aria-hidden />;
}

export function DashboardPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
      </div>
    </div>
  );
}

export function TablePageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-10 w-32" />
      </div>
      <Skeleton className="h-12 w-full max-w-md" />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <Skeleton className="h-12 w-full rounded-none" />
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="mx-4 my-3 h-14 w-[calc(100%-2rem)] rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function DetailTabsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
