import Link from "next/link";
import { Plus } from "lucide-react";

export function AddBranchButton() {
  return (
    <Link
      href="/bba/branches/new"
      className="flex items-center gap-2 bg-sky-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-sky-600/30 hover:shadow-sky-600/50 hover:bg-sky-700 transition-all hover:-translate-y-0.5 active:scale-95"
    >
      <Plus size={18} /> Daftarkan Apotek Baru
    </Link>
  );
}
