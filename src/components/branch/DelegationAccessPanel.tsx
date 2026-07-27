"use client";

import { Loader2, CheckCircle2, type LucideIcon } from "lucide-react";

export interface DelegationRole {
  key: string;
  label: string;
  Icon: LucideIcon;
  /** Aksen saat aktif. */
  accent: "indigo" | "amber";
  enabled: boolean;
  descOn: string;
  descOff: string;
  /** Chip kecil di bawah saat aktif, mis. "Portal Admin → Konfigurasi Gaji". */
  accessNote?: string;
  onToggle: (next: boolean) => void;
}

/**
 * Panel delegasi akses SERAGAM — satu sumber untuk semua toggle "izinkan admin/owner".
 * Visual: kartu sky + header ikon (gaya Pola & Jadwal); ringkas + chip akses (gaya Setup Gaji).
 * Dipakai di Setup Gaji (delegasi gaji) dan Pola & Jadwal (delegasi jadwal).
 */
export function DelegationAccessPanel({
  title,
  description,
  Icon,
  roles,
  isSaving = false,
}: {
  title: string;
  description: React.ReactNode;
  Icon: LucideIcon;
  roles: DelegationRole[];
  isSaving?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-sky-600" />
        <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{title}</p>
      </div>
      <p className="text-[10px] font-medium text-slate-500 leading-relaxed">{description}</p>

      <div className="space-y-2">
        {roles.map((r) => {
          const on = r.enabled;
          const accentBox = r.accent === "amber" ? "bg-amber-500 text-white" : "bg-indigo-600 text-white";
          const accentSwitch = r.accent === "amber" ? "bg-amber-500" : "bg-indigo-600";
          const accentCheck = r.accent === "amber" ? "text-amber-500" : "text-indigo-500";
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => r.onToggle(!on)}
              disabled={isSaving}
              className="w-full flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors disabled:opacity-60"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center transition-colors ${on ? accentBox : "bg-slate-100 text-slate-400"}`}>
                  <r.Icon size={15} />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-sm font-black text-slate-800">{r.label}</p>
                  <p className="text-[10px] text-slate-400 font-medium truncate">{on ? r.descOn : r.descOff}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isSaving && <Loader2 size={12} className="animate-spin text-slate-400" />}
                <div className={`w-11 h-6 rounded-full relative transition-colors ${on ? accentSwitch : "bg-slate-200"}`}>
                  <div className={`absolute top-[2px] h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "left-[calc(100%-22px)]" : "left-[2px]"}`} />
                </div>
                {on && <CheckCircle2 size={14} className={accentCheck} />}
              </div>
            </button>
          );
        })}
      </div>

      {roles.some((r) => r.enabled && r.accessNote) && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          {roles
            .filter((r) => r.enabled && r.accessNote)
            .map((r) => (
              <span
                key={r.key}
                className="inline-flex items-center gap-1 text-[9px] font-black text-sky-700 bg-sky-50 border border-sky-100 px-2.5 py-1 rounded-full uppercase tracking-widest"
              >
                <CheckCircle2 size={9} /> {r.accessNote}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
