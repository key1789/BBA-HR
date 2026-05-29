"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, KeyRound } from "lucide-react";
import { TabPegawai } from "./tab-pegawai";
import { TabBranchDeskAdmin } from "./tab-branch-desk-admin";

type Seg = "crew" | "admin";

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
