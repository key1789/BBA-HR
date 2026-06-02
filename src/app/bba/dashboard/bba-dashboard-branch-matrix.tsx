"use client";

import { useState, useMemo, type ReactNode } from "react";
import Link from "next/link";
import {
  Search,
  X,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type BranchHealthRow = {
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  todayStatus: "verified" | "pending" | "none";
  mtdPct: number;
  openQueue: number;
  overdueQueue: number;
  pendingLeave: number;
  pendingSwap: number;
  detailHref: string;
};

type SortKey =
  | "tenantCode"
  | "todayStatus"
  | "mtdPct"
  | "openQueue"
  | "overdueQueue"
  | "pendingLeave"
  | "pendingSwap";

const STATUS_ORDER: Record<BranchHealthRow["todayStatus"], number> = {
  verified: 0,
  pending: 1,
  none: 2,
};

function defaultScore(row: BranchHealthRow): number {
  return (
    row.overdueQueue * 100000 +
    (row.todayStatus === "none" ? 50000 : row.todayStatus === "pending" ? 10000 : 0) +
    row.openQueue
  );
}

function mtdTextColor(pct: number): string {
  if (pct >= 100) return "text-emerald-600";
  if (pct >= 75) return "text-sky-600";
  if (pct >= 50) return "text-amber-600";
  return "text-rose-600";
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey | null; sortDir: "asc" | "desc" }) {
  if (sortKey !== col) return <ArrowUpDown size={9} className="opacity-25 shrink-0" />;
  return sortDir === "asc" ? (
    <ChevronUp size={9} className="text-sky-600 shrink-0" />
  ) : (
    <ChevronDown size={9} className="text-sky-600 shrink-0" />
  );
}

export function BbaDashboardBranchMatrix({ rows }: { rows: BranchHealthRow[] }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const displayed = useMemo(() => {
    const q = search.toLowerCase().trim();
    const base = q
      ? rows.filter(
          (r) =>
            r.tenantCode.toLowerCase().includes(q) ||
            r.tenantName.toLowerCase().includes(q),
        )
      : rows;

    if (!sortKey) {
      return [...base].sort((a, b) => defaultScore(b) - defaultScore(a));
    }

    return [...base].sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case "tenantCode":
          diff = a.tenantCode.localeCompare(b.tenantCode);
          break;
        case "todayStatus":
          diff = STATUS_ORDER[a.todayStatus] - STATUS_ORDER[b.todayStatus];
          break;
        case "mtdPct":
          diff = a.mtdPct - b.mtdPct;
          break;
        case "openQueue":
          diff = a.openQueue - b.openQueue;
          break;
        case "overdueQueue":
          diff = a.overdueQueue - b.overdueQueue;
          break;
        case "pendingLeave":
          diff = a.pendingLeave - b.pendingLeave;
          break;
        case "pendingSwap":
          diff = a.pendingSwap - b.pendingSwap;
          break;
      }
      return sortDir === "asc" ? diff : -diff;
    });
  }, [rows, search, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function Th({
    col,
    children,
    className,
  }: {
    col: SortKey;
    children: ReactNode;
    className?: string;
  }) {
    return (
      <th className={cn("px-4 py-3", className)}>
        <button
          type="button"
          onClick={() => handleSort(col)}
          className="flex items-center gap-1 hover:text-slate-600 transition-colors whitespace-nowrap"
        >
          {children}
          <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
        </button>
      </th>
    );
  }

  const hiddenCount = rows.length - displayed.length;

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <Search
          size={13}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          type="text"
          placeholder="Cari kode atau nama cabang…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-[11px] font-bold text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-400 outline-none transition-all"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-100">
        <table className="min-w-full text-left">
          <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest">
            <tr>
              <Th col="tenantCode">Kode</Th>
              <th className="px-4 py-3 hidden sm:table-cell text-[9px] font-black text-slate-400 uppercase tracking-widest">
                Nama
              </th>
              <Th col="todayStatus">Hari Ini</Th>
              <Th col="mtdPct">MTD%</Th>
              <Th col="openQueue">Queue</Th>
              <Th col="overdueQueue">Overdue</Th>
              <Th col="pendingLeave">Izin</Th>
              <Th col="pendingSwap">Swap</Th>
              <th className="px-4 py-3 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {displayed.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-4 py-10 text-center text-[11px] font-bold text-slate-400"
                >
                  Tidak ada cabang yang cocok.
                </td>
              </tr>
            ) : (
              displayed.map((row) => (
                <tr
                  key={row.tenantId}
                  className={cn(
                    "hover:bg-slate-50/70 transition-colors",
                    row.overdueQueue > 0 && "border-l-2 border-l-rose-400",
                  )}
                >
                  {/* Code + Name (mobile) */}
                  <td className="px-4 py-2.5">
                    <p className="text-[11px] font-black text-slate-800 leading-none">{row.tenantCode}</p>
                    <p className="text-[9px] font-bold text-slate-400 mt-0.5 sm:hidden truncate max-w-[120px]">
                      {row.tenantName}
                    </p>
                  </td>

                  {/* Name (desktop) */}
                  <td className="px-4 py-2.5 hidden sm:table-cell">
                    <p className="text-[10px] font-bold text-slate-600 truncate max-w-[180px]">
                      {row.tenantName}
                    </p>
                  </td>

                  {/* Today status badge */}
                  <td className="px-4 py-2.5">
                    {row.todayStatus === "verified" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[9px] font-black whitespace-nowrap">
                        <CheckCircle2 size={9} /> Lapor
                      </span>
                    ) : row.todayStatus === "pending" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-[9px] font-black whitespace-nowrap">
                        <Clock size={9} /> Pending
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-700 rounded-full text-[9px] font-black whitespace-nowrap">
                        <XCircle size={9} /> Belum
                      </span>
                    )}
                  </td>

                  {/* MTD% */}
                  <td className="px-4 py-2.5">
                    <span className={cn("text-[11px] font-black tabular-nums", mtdTextColor(row.mtdPct))}>
                      {row.mtdPct}%
                    </span>
                  </td>

                  {/* Queue */}
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "text-[11px] font-bold tabular-nums",
                        row.openQueue > 0 ? "text-slate-700" : "text-slate-300",
                      )}
                    >
                      {row.openQueue}
                    </span>
                  </td>

                  {/* Overdue */}
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "text-[11px] font-black tabular-nums",
                        row.overdueQueue > 0 ? "text-rose-600" : "text-slate-300",
                      )}
                    >
                      {row.overdueQueue}
                    </span>
                  </td>

                  {/* Pending leave */}
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "text-[11px] font-bold tabular-nums",
                        row.pendingLeave > 0 ? "text-amber-600" : "text-slate-300",
                      )}
                    >
                      {row.pendingLeave}
                    </span>
                  </td>

                  {/* Pending swap */}
                  <td className="px-4 py-2.5">
                    <span
                      className={cn(
                        "text-[11px] font-bold tabular-nums",
                        row.pendingSwap > 0 ? "text-sky-600" : "text-slate-300",
                      )}
                    >
                      {row.pendingSwap}
                    </span>
                  </td>

                  {/* Link */}
                  <td className="px-4 py-2.5">
                    <Link
                      href={row.detailHref}
                      className="text-slate-300 hover:text-sky-600 transition-colors"
                      aria-label={`Buka audit ${row.tenantCode}`}
                    >
                      <ExternalLink size={12} />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {hiddenCount > 0 && (
        <p className="text-center text-[10px] font-bold text-slate-400">
          {hiddenCount} cabang disembunyikan · hapus filter untuk melihat semua
        </p>
      )}
    </div>
  );
}
