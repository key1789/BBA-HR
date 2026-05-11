"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect */

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, Edit, Store, ShieldBan, ShieldCheck, KeyRound, Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { toggleOwnerStatusAction } from "./actions";
import { EditOwnerModal } from "./edit-owner-modal";
import { ResendAccessModal } from "./resend-access-modal";

interface Props {
  owner: any;
}

export function OwnerActions({ owner }: Props) {
  const isInviteRow = owner.status !== "active";

  const [isOpen, setIsOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isResendModalOpen, setIsResendModalOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdown on outside click or scroll
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
      window.addEventListener("scroll", handleScroll, true); // true to catch scroll on any element
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
        right: window.innerWidth - rect.right 
      });
    }
    setIsOpen(!isOpen);
  };

  const handleToggleStatus = async () => {
    setIsOpen(false);
    const toastId = toast.loading("Memproses...");
    const result = await toggleOwnerStatusAction(owner.id, owner.is_active);
    if (result.error) {
      toast.error(result.error, { id: toastId });
    } else {
      toast.success(result.message, { id: toastId });
    }
  };

  const handleEditProfile = () => {
    setIsOpen(false);
    setIsEditModalOpen(true);
  };

  const handleResendAccess = () => {
    setIsOpen(false);
    setIsResendModalOpen(true);
  };

  const handleBuatApotek = () => {
    setIsOpen(false);
    router.push("/bba/branches");
  };

  const handleCopyInvite = () => {
    if (!owner.inviteLink) {
      toast.error("Link undangan tidak tersedia.");
      return;
    }
    navigator.clipboard.writeText(owner.inviteLink);
    toast.success("Link undangan disalin.");
  };

  if (isInviteRow) {
    return (
      <div className="flex justify-end">
        {owner.inviteLink ? (
          <button
            type="button"
            onClick={handleCopyInvite}
            title="Salin link undangan"
            className="p-2 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
          >
            <Copy size={18} />
          </button>
        ) : (
          <span className="text-[10px] font-bold text-slate-400 uppercase">—</span>
        )}
      </div>
    );
  }

  return (
    <>
      <button 
        ref={buttonRef}
        onClick={handleToggle}
        className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
      >
        <MoreVertical size={18} />
      </button>

      {mounted && isOpen && createPortal(
        <div 
          ref={dropdownRef}
          className="fixed w-52 bg-white rounded-xl shadow-lg border border-slate-100 z-[9999] overflow-hidden"
          style={{ top: position.top, right: position.right }}
        >
          <div className="p-1">
            <button 
              onClick={handleEditProfile}
              className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-amber-600 flex items-center gap-2 rounded-lg transition-colors"
            >
              <Edit size={14} /> Edit Profil
            </button>
            {owner.status === 'active' && (
              <button 
                onClick={handleResendAccess}
                className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-sky-600 flex items-center gap-2 rounded-lg transition-colors"
              >
                <KeyRound size={14} /> Kirim Ulang Akses
              </button>
            )}
            <button 
              onClick={handleBuatApotek}
              className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-emerald-600 flex items-center gap-2 rounded-lg transition-colors"
            >
              <Store size={14} /> Buat Data Apotek
            </button>
            <div className="h-px bg-slate-100 my-1 mx-2"></div>
            {owner.status === 'active' && (
              <button 
                onClick={handleToggleStatus}
                className={`w-full text-left px-3 py-2 text-xs font-medium flex items-center gap-2 rounded-lg transition-colors ${
                  owner.is_active ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'
                }`}
              >
                {owner.is_active ? (
                  <><ShieldBan size={14} /> Nonaktifkan Akun</>
                ) : (
                  <><ShieldCheck size={14} /> Aktifkan Akun</>
                )}
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      <EditOwnerModal 
        isOpen={isEditModalOpen} 
        onClose={() => setIsEditModalOpen(false)} 
        owner={owner} 
      />

      <ResendAccessModal
        isOpen={isResendModalOpen}
        onClose={() => setIsResendModalOpen(false)}
        owner={owner}
      />
    </>
  );
}
