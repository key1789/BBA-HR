"use client";

import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Tampilkan di dalam <Link> — indikator kecil saat navigasi pending */
export function LinkPendingHint({ className }: { className?: string }) {
  const { pending } = useLinkStatus();

  return (
    <Loader2
      size={14}
      aria-hidden
      className={cn(
        "shrink-0 animate-spin text-current transition-opacity duration-150",
        pending ? "opacity-90" : "opacity-0",
        className,
      )}
    />
  );
}
