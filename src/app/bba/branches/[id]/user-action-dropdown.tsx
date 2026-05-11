"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useState, useRef, useEffect, useTransition } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, Power, Loader2, Edit2, Send } from "lucide-react";
import { toggleMembershipStatusAction } from "./actions";
import { toast } from "sonner";
import { ResendAccessModal } from "./resend-access-modal";

interface Props {
  user: any;
  branchId: string;
  branchName: string;
  onEdit: (user: any) => void;
}

export function UserActionDropdown({ user, branchId, branchName, onEdit }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isResendModalOpen, setIsResendModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleScroll = () => setIsOpen(false);

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("scroll", handleScroll, true);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [isOpen]);

  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setIsOpen(!isOpen);
  };

  const handleToggleStatus = () => {
    setIsOpen(false);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("membershipId", user.id);
      formData.append("currentStatus", user.is_active.toString());
      formData.append("branchId", branchId);

      const result = await toggleMembershipStatusAction(formData);
      if (result.error) toast.error(result.error);
      else if (result.success) toast.success(result.message);
    });
  };

  const handleEdit = () => {
    setIsOpen(false);
    onEdit(user);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        disabled={isPending}
        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 rounded-lg transition-colors disabled:opacity-50"
      >
        {isPending ? <Loader2 size={18} className="animate-spin" /> : <MoreVertical size={18} />}
      </button>

      {mounted &&
        isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed w-48 bg-white rounded-xl shadow-lg border border-slate-100 z-[9999] overflow-hidden"
            style={{ top: position.top, right: position.right }}
          >
            <div className="py-1">
              <button
                type="button"
                onClick={handleEdit}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Edit2 size={14} className="text-sky-500" />
                Edit Profil
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setIsResendModalOpen(true);
                }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Send size={14} className="text-emerald-500" />
                Kirim Link Reset
              </button>
              <div className="h-px bg-slate-100 my-1 mx-2"></div>
              <button
                type="button"
                onClick={handleToggleStatus}
                className={`w-full flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                  user.is_active ? "text-rose-600 hover:bg-rose-50" : "text-emerald-600 hover:bg-emerald-50"
                }`}
              >
                <Power size={14} />
                {user.is_active ? "Nonaktifkan Pegawai" : "Aktifkan Pegawai"}
              </button>
            </div>
          </div>,
          document.body
        )}

      <ResendAccessModal
        isOpen={isResendModalOpen}
        onClose={() => setIsResendModalOpen(false)}
        user={user}
        branchId={branchId}
        branchName={branchName}
      />
    </>
  );
}
