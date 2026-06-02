import { Lock } from "lucide-react";

/**
 * Wraps page content with a lock overlay when an addon is disabled.
 * Children are rendered blurred as a preview — the overlay card explains
 * that the addon needs to be activated by the BBA team.
 */
export function AddonGate({
  enabled,
  addonName,
  addonKey,
  description,
  children,
}: {
  enabled: boolean;
  addonName: string;
  addonKey: string;
  description?: string;
  children: React.ReactNode;
}) {
  if (enabled) return <>{children}</>;

  return (
    <div className="relative min-h-[320px]">
      {/* Blurred preview of the real content */}
      <div
        className="pointer-events-none select-none blur-sm opacity-40"
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Lock overlay */}
      <div className="absolute inset-0 z-10 flex items-start justify-center px-4 pt-12">
        <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-2xl shadow-slate-200/60 backdrop-blur-sm">
          {/* Top accent stripe */}
          <div className="h-1 w-full bg-gradient-to-r from-slate-300 via-slate-400 to-slate-300" />

          <div className="px-6 py-7 text-center">
            {/* Lock icon */}
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <Lock size={22} className="text-slate-500" />
            </div>

            {/* Label */}
            <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Addon Belum Aktif
            </p>

            {/* Addon name */}
            <p className="text-base font-black text-slate-900">{addonName}</p>

            {/* Optional description */}
            {description && (
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                {description}
              </p>
            )}

            {/* Addon key chip */}
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-1.5">
              <span className="text-[10px] text-slate-400">addon key:</span>
              <code className="font-mono text-[11px] font-semibold text-slate-700">
                {addonKey}
              </code>
            </div>

            {/* CTA */}
            <p className="mt-4 text-[11px] leading-relaxed text-slate-400">
              Hubungi tim BBA untuk mengaktifkan fitur ini pada cabang Anda.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
