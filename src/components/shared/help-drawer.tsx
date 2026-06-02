"use client";

import { useState } from "react";
import { HelpCircle, X, AlertTriangle, Lightbulb, Info } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type HelpStep = {
  title: string;
  description: string;
};

export type HelpStatus = {
  label: string;
  /** Warna badge status */
  variant: "success" | "warning" | "error" | "info" | "neutral";
  description: string;
};

export type HelpTip = {
  type: "tip" | "warning" | "info";
  text: string;
};

export type HelpContent = {
  /** Nama menu — ditampilkan sebagai judul drawer */
  menuName: string;
  /** Deskripsi singkat: menu ini untuk apa */
  description: string;
  /** Langkah-langkah cara pakai */
  steps: HelpStep[];
  /** Keterangan badge/status yang muncul di halaman (opsional) */
  statuses?: HelpStatus[];
  /** Tips dan peringatan penting (opsional) */
  tips?: HelpTip[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_VARIANT_CLASS: Record<HelpStatus["variant"], string> = {
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  warning: "bg-amber-50   text-amber-700   border border-amber-200",
  error:   "bg-rose-50    text-rose-700    border border-rose-200",
  info:    "bg-sky-50     text-sky-700     border border-sky-200",
  neutral: "bg-slate-50   text-slate-600   border border-slate-200",
};

const TIP_STYLE = {
  tip:     { wrap: "bg-emerald-50 border-emerald-100", text: "text-emerald-800", Icon: Lightbulb  },
  warning: { wrap: "bg-amber-50   border-amber-100",   text: "text-amber-800",   Icon: AlertTriangle },
  info:    { wrap: "bg-sky-50     border-sky-100",     text: "text-sky-800",     Icon: Info       },
} satisfies Record<HelpTip["type"], { wrap: string; text: string; Icon: React.ElementType }>;

// ─── Component ───────────────────────────────────────────────────────────────

export function HelpDrawer({ content }: { content: HelpContent }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating trigger — di atas bottom nav */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buka panduan menu"
        className="fixed bottom-[88px] right-4 z-[55] w-11 h-11 bg-indigo-600 text-white rounded-full shadow-lg shadow-indigo-200/60 flex items-center justify-center hover:bg-indigo-700 active:scale-95 transition-all"
      >
        <HelpCircle size={20} />
      </button>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={`fixed inset-0 z-[70] bg-black/25 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Drawer — selalu di DOM agar animasi mulus */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-[70] flex flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out w-full max-w-[360px] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-indigo-50 flex-shrink-0">
          <div>
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-0.5">
              Panduan Menu
            </p>
            <h2 className="text-sm font-black text-slate-900 leading-tight">
              {content.menuName}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Tutup panduan"
            className="w-8 h-8 rounded-xl bg-white text-slate-400 hover:text-slate-700 flex items-center justify-center shadow-sm transition-colors flex-shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-7">

            {/* Deskripsi */}
            <div className="text-sm text-slate-600 leading-relaxed">
              {content.description}
            </div>

            {/* Cara Penggunaan */}
            <section>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                Cara Penggunaan
              </h3>
              <ol className="space-y-4">
                {content.steps.map((step, idx) => (
                  <li key={idx} className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-800 leading-snug">
                        {step.title}
                      </p>
                      <p className="text-xs text-slate-500 leading-relaxed mt-0.5">
                        {step.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {/* Keterangan Status */}
            {content.statuses && content.statuses.length > 0 && (
              <section>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  Keterangan Status
                </h3>
                <div className="space-y-2.5">
                  {content.statuses.map((s, idx) => (
                    <div key={idx} className="flex items-start gap-2.5">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold flex-shrink-0 mt-0.5 whitespace-nowrap ${STATUS_VARIANT_CLASS[s.variant]}`}
                      >
                        {s.label}
                      </span>
                      <p className="text-xs text-slate-500 leading-relaxed">{s.description}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Tips & Perhatian */}
            {content.tips && content.tips.length > 0 && (
              <section>
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  Tips & Perhatian
                </h3>
                <div className="space-y-2">
                  {content.tips.map((tip, idx) => {
                    const { wrap, text, Icon } = TIP_STYLE[tip.type];
                    return (
                      <div
                        key={idx}
                        className={`flex gap-2.5 p-3 rounded-xl border ${wrap}`}
                      >
                        <Icon size={13} className={`${text} flex-shrink-0 mt-0.5`} />
                        <p className={`text-xs leading-relaxed ${text}`}>{tip.text}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 flex-shrink-0">
          <p className="text-[10px] text-slate-400 text-center leading-relaxed">
            Butuh bantuan lebih lanjut? Hubungi tim BBA.
          </p>
        </div>
      </div>
    </>
  );
}
