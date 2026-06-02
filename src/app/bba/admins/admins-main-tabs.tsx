"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Download, Loader2, Mail, ScrollText, Users, ClipboardList } from "lucide-react";
import { GlassCard } from "@/components/shared/glass-card";
import { cn } from "@/lib/utils";
import { AdminsStaffTableClient } from "./admins-staff-table-client";
import { PendingInvitesClient, type PendingInviteRow } from "./pending-invites-client";
import type { AdminStaffRowVm } from "./admins-staff-types";
import type { BbaPortalMenuKey } from "@/lib/bba-portal-menus";
import { AUDIT_ACTION_LABEL, AUDIT_EXPORT_MAX, AUDIT_PAGE_SIZE, escapeCsvField, type AuditDisplayRow } from "./bba-portal-audit-shared";
import { fetchBbaPortalAuditLogsAction, exportBbaPortalAuditCsvAction } from "./actions";
import { toast } from "sonner";

type MenuRow = { key: BbaPortalMenuKey; label: string; pathPrefix: string };

type TabId = "staff" | "log";

function downloadAuditCsv(rows: AuditDisplayRow[]) {
  const header = ["waktu", "aktor", "aksi", "detail", "target_user_id", "metadata_json"];
  const lines = [header, ...rows.map((r) => [
    new Date(r.created_at).toISOString(),
    r.actorName,
    r.actionLabel,
    r.detail,
    r.targetUserId ?? "",
    r.metadata == null ? "" : JSON.stringify(r.metadata),
  ])];
  const BOM = "\uFEFF";
  const content = BOM + lines.map((line) => line.map(escapeCsvField).join(",")).join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bba-portal-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AdminsMainTabs({
  staffRows,
  branches,
  menuCatalog,
  pendingInvites,
  initialAuditRows,
  initialAuditHasMore,
  auditAvailable,
  auditRangeError,
}: {
  staffRows: AdminStaffRowVm[];
  branches: unknown[];
  menuCatalog: MenuRow[];
  pendingInvites: PendingInviteRow[];
  initialAuditRows: AuditDisplayRow[];
  initialAuditHasMore: boolean;
  auditAvailable: boolean;
  auditRangeError?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab: TabId = searchParams.get("tab") === "log" ? "log" : "staff";
  const fromUrl = searchParams.get("from") ?? "";
  const toUrl = searchParams.get("to") ?? "";

  const [draftFrom, setDraftFrom] = useState(fromUrl);
  const [draftTo, setDraftTo] = useState(toUrl);
  const [logRows, setLogRows] = useState<AuditDisplayRow[]>(initialAuditRows);
  const [hasMore, setHasMore] = useState(initialAuditHasMore);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [logQuery, setLogQuery] = useState("");
  const [isPendingMore, startMore] = useTransition();
  const [isPendingExport, startExport] = useTransition();

  useEffect(() => {
    setDraftFrom(fromUrl);
    setDraftTo(toUrl);
  }, [fromUrl, toUrl]);

  useEffect(() => {
    setLogRows(initialAuditRows);
    setHasMore(initialAuditHasMore);
  }, [initialAuditRows, initialAuditHasMore]);

  const setTabAndUrl = useCallback(
    (next: TabId) => {
      const p = new URLSearchParams(searchParams.toString());
      if (next === "staff") p.delete("tab");
      else p.set("tab", "log");
      const q = p.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const applyDateFiltersToUrl = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    if (tab === "log") p.set("tab", "log");
    if (draftFrom) p.set("from", draftFrom);
    else p.delete("from");
    if (draftTo) p.set("to", draftTo);
    else p.delete("to");
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [draftFrom, draftTo, pathname, router, searchParams, tab]);

  const clearDateFilters = useCallback(() => {
    setDraftFrom("");
    setDraftTo("");
    const p = new URLSearchParams(searchParams.toString());
    p.delete("from");
    p.delete("to");
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const actionOptions = useMemo(() => {
    const keys = [...new Set(logRows.map((r) => r.actionKey))].filter(Boolean).sort();
    return keys;
  }, [logRows]);

  const filteredLogRows = useMemo(() => {
    let list = logRows;
    if (actionFilter !== "all") list = list.filter((r) => r.actionKey === actionFilter);
    const qq = logQuery.trim().toLowerCase();
    if (qq) {
      list = list.filter((r) => {
        if (r.actorName.toLowerCase().includes(qq)) return true;
        if (r.actionLabel.toLowerCase().includes(qq)) return true;
        if (r.detail.toLowerCase().includes(qq)) return true;
        if (r.targetUserId && r.targetUserId.toLowerCase().includes(qq)) return true;
        try {
          if (JSON.stringify(r.metadata ?? {}).toLowerCase().includes(qq)) return true;
        } catch {
          /* ignore */
        }
        return false;
      });
    }
    return list;
  }, [logRows, actionFilter, logQuery]);

  const loadMore = () => {
    startMore(async () => {
      const res = await fetchBbaPortalAuditLogsAction(logRows.length, AUDIT_PAGE_SIZE, {
        from: searchParams.get("from"),
        to: searchParams.get("to"),
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      setLogRows((prev) => [...prev, ...res.rows]);
      setHasMore(res.hasMore);
    });
  };

  const exportFromServer = () => {
    startExport(async () => {
      const res = await exportBbaPortalAuditCsvAction({
        from: searchParams.get("from"),
        to: searchParams.get("to"),
        actionKey: actionFilter === "all" ? null : actionFilter,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      const BOM = "\uFEFF";
      const blob = new Blob([BOM + res.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const tag = [searchParams.get("from"), searchParams.get("to")].filter(Boolean).join("_") || "all";
      a.download = `bba-portal-audit-server_${tag}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      if (res.truncated) {
        toast.message(`Diekspor maksimal ${AUDIT_EXPORT_MAX} baris (hasil dipotong).`);
      } else {
        toast.success(`Diekspor ${res.rowCount} baris dari server.`);
      }
    });
  };

  return (
    <GlassCard variant="light" className="overflow-hidden p-0">
      <div
        className="flex gap-1 border-b border-slate-200 bg-slate-50/95 p-1.5 sm:gap-2 sm:px-3 sm:py-2"
        role="tablist"
        aria-label="Bagian kelola super admin"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "staff"}
          id="admins-tab-staff"
          aria-controls="admins-panel-staff"
          onClick={() => setTabAndUrl("staff")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[11px] font-black uppercase tracking-wider transition sm:flex-initial sm:px-5",
            tab === "staff"
              ? "bg-white text-sky-700 shadow-sm ring-1 ring-slate-200/80"
              : "text-slate-500 hover:text-slate-700",
          )}
        >
          <Users size={15} aria-hidden />
          Staff & undangan
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "log"}
          id="admins-tab-log"
          aria-controls="admins-panel-log"
          onClick={() => setTabAndUrl("log")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-[11px] font-black uppercase tracking-wider transition sm:flex-initial sm:px-5",
            tab === "log"
              ? "bg-white text-sky-700 shadow-sm ring-1 ring-slate-200/80"
              : "text-slate-500 hover:text-slate-700",
          )}
        >
          <ClipboardList size={15} aria-hidden />
          Log tindakan
        </button>
      </div>

      <div
        id="admins-panel-staff"
        role="tabpanel"
        aria-labelledby="admins-tab-staff"
        hidden={tab !== "staff"}
        className={tab === "staff" ? undefined : "hidden"}
      >
        {pendingInvites.length > 0 && (
          <div className="border-b border-slate-100">
            <div className="flex items-center gap-2 bg-slate-50/80 px-4 py-3 sm:px-5">
              <Mail size={16} className="text-sky-600" aria-hidden />
              <p className="text-xs font-black uppercase tracking-widest text-slate-600">Undangan analyst menunggu</p>
            </div>
            <PendingInvitesClient invites={pendingInvites} />
          </div>
        )}
        <AdminsStaffTableClient rows={staffRows} branches={branches} menuCatalog={menuCatalog} />
      </div>

      <div
        id="admins-panel-log"
        role="tabpanel"
        aria-labelledby="admins-tab-log"
        hidden={tab !== "log"}
        className={tab === "log" ? undefined : "hidden"}
      >
        {auditRangeError ? (
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-center text-xs text-amber-950 sm:px-5">
            Filter tanggal diabaikan: {auditRangeError}
          </div>
        ) : null}

        {!auditAvailable ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            Tabel audit belum tersedia. Jalankan migrasi <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">0029_bba_portal_admin_audit</code>{" "}
            di Supabase, lalu refresh halaman.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex items-center gap-2">
                <ScrollText size={16} className="text-slate-600" aria-hidden />
                <p className="text-xs font-black uppercase tracking-widest text-slate-600">Riwayat tindakan portal</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadAuditCsv(filteredLogRows)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-700 transition hover:bg-slate-50"
                >
                  <Download size={14} aria-hidden />
                  CSV (tampilan)
                </button>
                <button
                  type="button"
                  disabled={isPendingExport}
                  onClick={exportFromServer}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-sky-900 transition hover:bg-sky-100 disabled:opacity-50"
                >
                  {isPendingExport ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Download size={14} aria-hidden />}
                  CSV server
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-b border-slate-100 bg-white px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3 sm:px-5">
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Dari
                <input
                  type="date"
                  value={draftFrom}
                  onChange={(e) => setDraftFrom(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Sampai
                <input
                  type="date"
                  value={draftTo}
                  onChange={(e) => setDraftTo(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case text-slate-900 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
                />
              </label>
              <div className="flex flex-wrap gap-2 pb-0.5">
                <button
                  type="button"
                  onClick={applyDateFiltersToUrl}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-slate-800"
                >
                  Terapkan tanggal
                </button>
                <button
                  type="button"
                  onClick={clearDateFilters}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-600 transition hover:bg-slate-50"
                >
                  Reset tanggal
                </button>
              </div>
            </div>

            {logRows.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">Belum ada entri log.</p>
            ) : (
              <>
                <div className="flex flex-col gap-2 border-b border-slate-100 bg-white px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:px-5">
                  <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:max-w-xs">
                    Cari
                    <input
                      type="search"
                      value={logQuery}
                      onChange={(e) => setLogQuery(e.target.value)}
                      placeholder="Aktor, aksi, detail, UUID…"
                      className="rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm font-normal normal-case text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Jenis aksi
                    <select
                      value={actionFilter}
                      onChange={(e) => setActionFilter(e.target.value)}
                      className="min-w-[180px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal normal-case text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/25"
                    >
                      <option value="all">Semua</option>
                      {actionOptions.map((k) => (
                        <option key={k} value={k}>
                          {AUDIT_ACTION_LABEL[k] ?? k}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {filteredLogRows.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-slate-500">Tidak ada baris yang cocok dengan filter.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-white">
                          <th className="w-8 px-2 py-2.5 sm:px-3" aria-hidden />
                          <th className="px-2 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-4">
                            Waktu
                          </th>
                          <th className="px-2 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-4">
                            Aktor
                          </th>
                          <th className="px-2 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-4">
                            Aksi
                          </th>
                          <th className="px-2 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 sm:px-4">
                            Detail
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredLogRows.map((row) => (
                          <Fragment key={row.id}>
                            <tr
                              className="cursor-pointer text-slate-700 transition hover:bg-slate-50/90"
                              onClick={() => setExpandedId((id) => (id === row.id ? null : row.id))}
                            >
                              <td className="px-2 py-2 align-middle sm:px-3">
                                <ChevronDown
                                  size={16}
                                  className={cn(
                                    "text-slate-400 transition-transform",
                                    expandedId === row.id && "rotate-180",
                                  )}
                                  aria-hidden
                                />
                              </td>
                              <td className="whitespace-nowrap px-2 py-2.5 text-xs text-slate-500 sm:px-4">
                                {new Date(row.created_at).toLocaleString("id-ID", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                              </td>
                              <td className="px-2 py-2.5 text-xs sm:px-4">{row.actorName}</td>
                              <td className="px-2 py-2.5 text-xs font-semibold sm:px-4">{row.actionLabel}</td>
                              <td className="max-w-md truncate px-2 py-2.5 font-mono text-[11px] text-slate-500 sm:px-4">
                                {row.detail}
                              </td>
                            </tr>
                            {expandedId === row.id && (
                              <tr className="bg-slate-50/80">
                                <td colSpan={5} className="px-4 py-3 sm:px-6" onClick={(e) => e.stopPropagation()}>
                                  {row.targetUserId ? (
                                    <p className="mb-2 break-all font-mono text-[11px] text-slate-700">
                                      <span className="font-bold text-slate-500">Target user ID:</span> {row.targetUserId}
                                    </p>
                                  ) : null}
                                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Metadata</p>
                                  <pre className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-800">
                                    {JSON.stringify(row.metadata ?? {}, null, 2)}
                                  </pre>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {hasMore && (
                  <div className="border-t border-slate-100 px-4 py-3 text-center sm:px-5">
                    <button
                      type="button"
                      disabled={isPendingMore}
                      onClick={loadMore}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      {isPendingMore ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
                      Muat lebih
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </GlassCard>
  );
}
