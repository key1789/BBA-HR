"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface SchemeCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  children: ReactNode;
  iconBgColor?: string;
  iconTextColor?: string;
}

export function SchemeCard({
  title,
  description,
  icon,
  enabled,
  onToggle,
  isExpanded,
  onToggleExpand,
  children,
  iconBgColor = "bg-sky-50",
  iconTextColor = "text-sky-600",
}: SchemeCardProps) {
  return (
    <div
      className={`rounded-3xl border-2 transition-all duration-500 ${
        enabled
          ? "border-sky-600 bg-white shadow-xl shadow-sky-500/10"
          : "border-slate-100 bg-slate-50/50 opacity-60"
      }`}
    >
      {/* Header */}
      <div className="p-6">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onToggleExpand}
            className="flex items-center gap-4 flex-1 text-left group"
          >
            <div
              className={`w-12 h-12 rounded-2xl ${enabled ? iconBgColor : "bg-slate-200"} ${enabled ? iconTextColor : "text-slate-400"} flex items-center justify-center transition-all duration-500 ${enabled ? "rotate-6 scale-110" : ""}`}
            >
              {icon}
            </div>
            <div className="flex-1">
              <h4 className="font-black text-slate-800 text-sm uppercase tracking-tight flex items-center gap-2">
                {title}
                {isExpanded ? (
                  <ChevronDown size={16} className="text-slate-400" />
                ) : (
                  <ChevronRight size={16} className="text-slate-400" />
                )}
              </h4>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed font-medium">{description}</p>
            </div>
          </button>

          {/* Toggle Switch */}
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-black text-slate-400 uppercase">
              {enabled ? "Aktif" : "Non-aktif"}
            </span>
            <button
              type="button"
              onClick={() => onToggle(!enabled)}
              className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
                enabled ? "bg-sky-600" : "bg-slate-300"
              }`}
            >
              <div
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 ${
                  enabled ? "translate-x-6" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Collapsible Content */}
      {enabled && isExpanded && (
        <div className="border-t border-slate-100 p-6 animate-in fade-in slide-in-from-top-2 duration-500">
          {children}
        </div>
      )}
    </div>
  );
}
