"use client";

import { useState } from "react";
import { Bell, Wrench, X } from "lucide-react";

export function BellButton({ unreadCount }: { unreadCount: number }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative shrink-0 w-10 h-10 rounded-2xl bg-slate-100 hover:bg-sky-50 flex items-center justify-center transition-colors group"
      >
        <Bell size={18} className="text-slate-500 group-hover:text-sky-600 transition-colors" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-rose-500 text-white text-[9px] font-black rounded-full flex items-center justify-center px-1 leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 text-center relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X size={18} />
            </button>
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Wrench size={28} className="text-amber-600" />
            </div>
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
              Dalam Pengembangan
            </h2>
            <p className="text-sm font-medium text-slate-500 mt-2 leading-relaxed">
              Fitur pengumuman sedang dalam tahap pengembangan.
              Nantikan pembaruan berikutnya!
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-6 px-6 py-2.5 bg-indigo-600 text-white text-sm font-black rounded-xl hover:bg-indigo-700 transition-colors w-full"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}
    </>
  );
}
