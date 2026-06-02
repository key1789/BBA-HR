"use client";

import { useActionState, useState, useEffect } from "react";
import { useFormStatus, createPortal } from "react-dom";
import { switchPortalAction } from "@/actions/switch-portal";
import {
  ShieldCheck,
  Users,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Loader2,
  X,
  ChevronRight,
} from "lucide-react";

type Target = "crew" | "admin";

interface Props {
  target: Target;
  /** "sidebar" = full-width sidebar link style; "pill" = compact mobile header pill */
  variant?: "sidebar" | "pill";
  userEmail?: string;
}

// ── Submit button (must live inside <form> for useFormStatus) ─────────────────
function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
    >
      {pending ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          Memverifikasi...
        </>
      ) : (
        label
      )}
    </button>
  );
}

// ── Modal body — separate component so useActionState resets on each open ─────
function ModalContent({
  target,
  userEmail,
  onClose,
}: {
  target: Target;
  userEmail: string;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState(switchPortalAction, null);
  const [showPassword, setShowPassword] = useState(false);

  const targetLabel = target === "admin" ? "Admin" : "Crew";
  const TargetIcon = target === "admin" ? ShieldCheck : Users;

  // Close on Escape + lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", handler);
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card */}
      <div className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-600 rounded-2xl flex items-center justify-center shrink-0">
              <TargetIcon size={18} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900 uppercase tracking-tight">
                Konfirmasi Identitas
              </p>
              <p className="text-[10px] text-slate-400">
                Masuk sebagai {targetLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="target" value={target} />

          {/* Error banner */}
          {state?.error && (
            <div className="rounded-xl bg-rose-50 border border-rose-100 px-3.5 py-2.5 text-xs font-semibold text-rose-600">
              {state.error}
            </div>
          )}

          {/* Email */}
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">
              Email
            </span>
            <div className="relative">
              <Mail
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="email"
                name="email"
                defaultValue={userEmail}
                required
                autoComplete="email"
                placeholder="email@apotek.com"
                className="w-full rounded-xl border border-slate-300 pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
            </div>
          </label>

          {/* Password */}
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-600">
              Password
            </span>
            <div className="relative">
              <Lock
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-300 pl-9 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </label>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Batal
            </button>
            <SubmitBtn label={`Masuk sebagai ${targetLabel}`} />
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── Public export ─────────────────────────────────────────────────────────────
export function SwitchModeModal({
  target,
  variant = "sidebar",
  userEmail = "",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const label = target === "admin" ? "Mode Admin" : "Mode Crew";
  const Icon = target === "admin" ? ShieldCheck : Users;

  return (
    <>
      {/* Trigger button */}
      {variant === "sidebar" ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-slate-500 hover:text-sky-700 hover:bg-sky-50 transition-colors group"
        >
          <Icon
            size={16}
            className="shrink-0 text-slate-400 group-hover:text-sky-600"
          />
          <span className="text-xs font-bold flex-1">{label}</span>
          <ChevronRight
            size={13}
            className="text-slate-300 group-hover:text-sky-400"
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1.5 bg-white/15 text-white px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wide border border-white/20"
        >
          <Icon size={13} />
          {target === "admin" ? "Admin Mode" : "Crew Mode"}
        </button>
      )}

      {/* Modal — only mounts when open, so state resets automatically on close */}
      {isOpen && (
        <ModalContent
          target={target}
          userEmail={userEmail}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
