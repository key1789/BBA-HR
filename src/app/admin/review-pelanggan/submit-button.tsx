"use client";

import { useFormStatus } from "react-dom";
import { Star, Loader2 } from "lucide-react";

export function SubmitReviewButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
    >
      {pending ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          Menyimpan...
        </>
      ) : (
        <>
          <Star size={14} />
          Simpan Review
        </>
      )}
    </button>
  );
}
