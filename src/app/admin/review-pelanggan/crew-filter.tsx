"use client";

import { useRouter } from "next/navigation";

export function CrewFilter({
  crew,
  selectedId,
}: {
  crew: { id: string; full_name: string }[];
  selectedId: string | null;
}) {
  const router = useRouter();

  return (
    <select
      value={selectedId ?? ""}
      onChange={(e) => {
        const val = e.target.value;
        router.push(
          val
            ? `/admin/review-pelanggan?karyawan=${val}`
            : "/admin/review-pelanggan",
        );
      }}
      className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300 max-w-[200px] w-full"
    >
      <option value="">Semua Karyawan</option>
      {crew.map((c) => (
        <option key={c.id} value={c.id}>
          {c.full_name}
        </option>
      ))}
    </select>
  );
}
