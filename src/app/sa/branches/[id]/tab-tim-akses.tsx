"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, KeyRound, ClipboardList, UserCog, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import { TabPegawai } from "./tab-pegawai";
import { TabBranchDeskAdmin } from "./tab-branch-desk-admin";
import { updateClosingModeAction } from "./actions";

type Seg = "crew" | "admin";
type ClosingMode = "berjenjang" | "admin_full";

const SEGMENTS: { id: Seg; label: string; Icon: React.ElementType }[] = [
  { id: "crew",  label: "Manajemen Crew", Icon: Users },
  { id: "admin", label: "Akun Admin",     Icon: KeyRound },
];

export function TabTimAkses({
  branch,
  users,
}: {
  branch: any;
  users: any[];
}) {
  const [active, setActive] = useState<Seg>("crew");

  return (
    <div className="space-y-5 pb-10">

      {/* ── Mode Closingan ── */}
      <ClosingModeCard branchId={branch?.id} initialMode={branch?.closing_mode === "admin_full" ? "admin_full" : "berjenjang"} />

      {/* ── Segment control ── */}
      <div className="flex gap-1 p-1.5 bg-white rounded-2xl border border-slate-100 shadow-lg shadow-slate-200/40">
        {SEGMENTS.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActive(id)}
              className={`relative flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                isActive ? "text-sky-600" : "text-slate-400 hover:text-slate-700"
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="timAksesSeg"
                  className="absolute inset-0 bg-sky-50 rounded-xl border border-sky-100 shadow-sm"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                />
              )}
              <div className={`relative z-10 w-5 h-5 rounded-md flex items-center justify-center transition-all duration-300 ${
                isActive ? "bg-sky-600 text-white shadow-md shadow-sky-600/30" : "bg-slate-50 text-slate-400"
              }`}>
                <Icon size={12} />
              </div>
              <span className="relative z-10 hidden sm:inline">{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
        >
          {active === "crew"  && <TabPegawai branch={branch} users={users} />}
          {active === "admin" && <TabBranchDeskAdmin branch={branch} users={users} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Mode Closingan — siapa yang mencatat closingan di apotek ini.
//   berjenjang : crew catat → admin verifikasi (default).
//   admin_full : admin catat atas nama crew → auto-approve.
// ─────────────────────────────────────────────────────────

const CLOSING_MODES: {
  id: ClosingMode; label: string; desc: string; Icon: React.ElementType;
}[] = [
  {
    id: "berjenjang",
    label: "Berjenjang",
    desc: "Crew mencatat closingan sendiri, admin memverifikasi. Cocok bila tiap crew punya akses input.",
    Icon: ClipboardList,
  },
  {
    id: "admin_full",
    label: "Admin Penuh",
    desc: "Admin mencatat closingan atas nama tiap crew, langsung sah tanpa verifikasi. Crew tetap absen, lihat rapor & gaji.",
    Icon: UserCog,
  },
];

function ClosingModeCard({ branchId, initialMode }: { branchId?: string; initialMode: ClosingMode }) {
  const [mode, setMode] = useState<ClosingMode>(initialMode);
  const [pending, startTransition] = useTransition();

  const handleSelect = (next: ClosingMode) => {
    if (next === mode || pending || !branchId) return;
    const prev = mode;
    setMode(next); // optimistic
    startTransition(async () => {
      const fd = new FormData();
      fd.set("tenantId", branchId);
      fd.set("closingMode", next);
      const res = await updateClosingModeAction(null, fd);
      if (res?.error) {
        setMode(prev); // revert
        toast.error(res.error);
      } else if (res?.success) {
        toast.success(res.message ?? "Mode closingan diperbarui.");
      }
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-lg shadow-slate-200/40 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Mode Closingan</p>
        {pending && <Loader2 size={12} className="animate-spin text-sky-500" />}
      </div>
      <p className="text-[11px] leading-relaxed text-slate-400 mb-3">
        Menentukan siapa yang mencatat closingan harian di apotek ini.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {CLOSING_MODES.map(({ id, label, desc, Icon }) => {
          const isActive = mode === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handleSelect(id)}
              disabled={pending}
              className={`relative text-left p-3.5 rounded-xl border-2 transition-all duration-200 disabled:opacity-70 ${
                isActive
                  ? "border-sky-500 bg-sky-50/60 shadow-sm"
                  : "border-slate-100 bg-slate-50/40 hover:border-slate-200"
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                  isActive ? "bg-sky-600 text-white" : "bg-white text-slate-400 border border-slate-200"
                }`}>
                  <Icon size={13} />
                </div>
                <span className={`text-xs font-black ${isActive ? "text-sky-700" : "text-slate-600"}`}>{label}</span>
                {isActive && (
                  <span className="ml-auto text-[8px] font-black uppercase tracking-widest text-sky-600 bg-white border border-sky-200 px-1.5 py-0.5 rounded-md">
                    Aktif
                  </span>
                )}
              </div>
              <p className="text-[10px] leading-relaxed text-slate-500">{desc}</p>
            </button>
          );
        })}
      </div>

      {mode === "admin_full" && (
        <div className="mt-3 flex gap-2 items-start p-2.5 bg-amber-50/70 border border-amber-100 rounded-xl">
          <Info size={13} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-[10px] leading-relaxed text-amber-800">
            Menu <span className="font-black">Input Harian</span> crew disembunyikan; admin memakai menu <span className="font-black">Input Closingan</span>.
          </p>
        </div>
      )}
    </div>
  );
}
