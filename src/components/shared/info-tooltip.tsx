"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Ikon ⓘ yang bisa diklik untuk menampilkan penjelasan singkat suatu section.
 * Tooltip di-render via React Portal ke document.body — tidak terpengaruh
 * oleh overflow:hidden pada parent (misal: GlassCard).
 * Klik di luar atau tekan Escape untuk menutup.
 */
export function InfoTooltip({
  content,
  side = "top",
  width = "w-64",
  className,
}: {
  content: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  width?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Pastikan portal hanya dipakai di client (hindari SSR error)
  useEffect(() => setMounted(true), []);

  // Hitung posisi fixed setiap kali tooltip dibuka
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const gap = 8;
    let top = 0;
    let left = 0;
    if (side === "top")    { top = r.top - gap;            left = r.left + r.width / 2; }
    if (side === "bottom") { top = r.bottom + gap;         left = r.left + r.width / 2; }
    if (side === "left")   { top = r.top + r.height / 2;  left = r.left - gap; }
    if (side === "right")  { top = r.top + r.height / 2;  left = r.right + gap; }
    setCoords({ top, left });
  }, [open, side]);

  // Tutup saat klik di luar atau tekan Escape
  useEffect(() => {
    if (!open) return;
    const onMouse = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        panelRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onMouse);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouse);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // CSS transform berdasarkan side: panel muncul di arah yang benar
  const transformMap: Record<string, string> = {
    top:    "translate(-50%, -100%)",
    bottom: "translate(-50%, 0%)",
    left:   "translate(-100%, -50%)",
    right:  "translate(0%, -50%)",
  };

  // Arah panah kecil di tepi panel
  const arrowClass: Record<string, string> = {
    top:    "top-full left-1/2 -translate-x-1/2 border-t-slate-200",
    bottom: "bottom-full left-1/2 -translate-x-1/2 border-b-slate-200",
    left:   "left-full top-1/2 -translate-y-1/2 border-l-slate-200",
    right:  "right-full top-1/2 -translate-y-1/2 border-r-slate-200",
  };
  const arrowInnerClass: Record<string, string> = {
    top:    "top-full left-1/2 -translate-x-1/2 -mt-[1px] border-t-white",
    bottom: "bottom-full left-1/2 -translate-x-1/2 mb-[-1px] border-b-white",
    left:   "left-full top-1/2 -translate-y-1/2 -ml-[1px] border-l-white",
    right:  "right-full top-1/2 -translate-y-1/2 mr-[-1px] border-r-white",
  };

  const panel = (
    <div
      ref={panelRef}
      role="tooltip"
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        transform: transformMap[side],
        zIndex: 9999,
      }}
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-3 shadow-xl",
        "text-[11px] leading-relaxed text-slate-600",
        width,
      )}
    >
      {content}
      {/* Panah luar (border) */}
      <span className={cn("absolute border-4 border-transparent", arrowClass[side])} />
      {/* Panah dalam (putih) */}
      <span className={cn("absolute border-4 border-transparent", arrowInnerClass[side])} />
    </div>
  );

  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Lihat penjelasan"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-[18px] w-[18px] items-center justify-center rounded-full transition-colors",
          open
            ? "bg-indigo-100 text-indigo-600"
            : "text-slate-400 hover:bg-slate-100 hover:text-slate-600",
        )}
      >
        <Info size={12} strokeWidth={2.5} />
      </button>

      {/* Portal: render di luar DOM tree → tidak kena overflow:hidden */}
      {mounted && open && createPortal(panel, document.body)}
    </span>
  );
}
