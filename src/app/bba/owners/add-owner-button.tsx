"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { AddOwnerModal } from "./add-owner-modal";

export function AddOwnerButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 bg-sky-600 text-white px-5 py-2.5 rounded-xl font-black text-sm shadow-lg shadow-sky-600/30 hover:bg-sky-700 transition-all active:scale-95"
      >
        <Plus size={18} /> Tambah owner
      </button>

      <AddOwnerModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
