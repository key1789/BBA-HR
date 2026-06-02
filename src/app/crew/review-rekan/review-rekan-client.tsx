"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, CheckCircle2, User, X, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { submitPeerReviewAction } from "@/actions/reviews";
import { toast } from "sonner";

interface Colleague {
  id: string;
  name: string;
}

interface Review {
  reviewee_user_id: string;
  rating: number;
  comment: string;
  created_at: string;
}

type Props = {
  colleagues: Colleague[];
  myReviews: Review[];
  limitPerMonth: number;
};

const STAR_LABELS = ["", "Kurang", "Cukup", "Baik", "Sangat Baik", "Luar Biasa"];

export function ReviewRekanClient({ colleagues, myReviews, limitPerMonth }: Props) {
  const router = useRouter();
  const [selectedColleague, setSelectedColleague] = useState<Colleague | null>(null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Confirmation step: false = form, true = confirm summary
  const [confirmStep, setConfirmStep] = useState(false);

  const closeModal = () => {
    setSelectedColleague(null);
    setRating(0);
    setHoverRating(0);
    setComment("");
    setConfirmStep(false);
  };

  const reviewsGivenCount = myReviews.length;
  const isLimitReached = reviewsGivenCount >= limitPerMonth;
  const remainingReviews = Math.max(limitPerMonth - reviewsGivenCount, 0);

  // Step 1: user clicks "Kirim Penilaian" → show confirmation summary
  const handleRequestConfirm = () => {
    if (!selectedColleague || rating === 0) return;
    setConfirmStep(true);
  };

  // Step 2: user clicks "Ya, Kirim" in confirmation → actual submit
  const handleConfirmSubmit = async () => {
    if (!selectedColleague || rating === 0) return;

    setIsSubmitting(true);
    try {
      const result = await submitPeerReviewAction({
        revieweeId: selectedColleague.id,
        rating,
        comment,
      });

      if (result.success) {
        toast.success("Penilaian berhasil dikirim.");
        closeModal();
        router.refresh();
      } else {
        toast.error(result.error || "Gagal mengirim review");
        // Return to form so user can see error context
        setConfirmStep(false);
      }
    } catch {
      toast.error("Terjadi kesalahan saat mengirim review.");
      setConfirmStep(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getReviewForColleague = (colleagueId: string) => {
    return myReviews.find((r) => r.reviewee_user_id === colleagueId);
  };

  const displayRating = hoverRating || rating;

  return (
    <div className="space-y-6">
      {/* 1. Dashboard Info */}
      <div className="bg-gradient-to-br from-sky-600 to-sky-700 rounded-3xl p-6 text-white shadow-lg flex items-center justify-between">
        <div>
          <p className="text-sky-100 text-[10px] font-black uppercase tracking-widest mb-1">
            Status Penilaian Bulan Ini
          </p>
          <h2 className="text-2xl font-black">
            {reviewsGivenCount}{" "}
            <span className="text-sky-200 text-sm font-bold">/ {limitPerMonth} Penilaian</span>
          </h2>
          <p className="text-sky-100 text-xs font-bold mt-1">Sisa kuota: {remainingReviews}</p>
          {isLimitReached && (
            <p className="text-amber-200 text-[11px] font-bold mt-1">Kuota bulan ini sudah habis.</p>
          )}
        </div>
        <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
          <Star className="text-white fill-white" size={28} />
        </div>
      </div>

      {/* 2. Daftar Rekan */}
      <div className="space-y-4">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest px-2">
          Rekan Satu Tim
        </h3>
        <div className="grid grid-cols-1 gap-3">
          {colleagues.length === 0 && (
            <div className="bg-white rounded-3xl p-6 border border-slate-100 text-center">
              <p className="text-sm text-slate-400 font-bold">Belum ada rekan terdaftar.</p>
            </div>
          )}
          {colleagues.map((col) => {
            const review = getReviewForColleague(col.id);
            const isReviewed = !!review;

            return (
              <div
                key={col.id}
                className={cn(
                  "bg-white rounded-3xl p-5 border transition-all flex items-center justify-between",
                  isReviewed
                    ? "border-emerald-100 bg-emerald-50/30"
                    : "border-slate-100 shadow-sm hover:shadow-md",
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400">
                    <User size={24} />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-800">{col.name}</h4>
                    {isReviewed ? (
                      <div className="flex items-center gap-1 mt-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            size={12}
                            className={cn(
                              i < review.rating
                                ? "text-amber-500 fill-amber-500"
                                : "text-slate-200",
                            )}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                        Belum dinilai
                      </p>
                    )}
                  </div>
                </div>

                {isReviewed ? (
                  <div className="bg-emerald-100 text-emerald-600 p-2 rounded-xl">
                    <CheckCircle2 size={20} />
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedColleague(col)}
                    disabled={isLimitReached}
                    className="rounded-2xl px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-sky-600 text-white hover:bg-sky-500 transition-all disabled:bg-slate-100 disabled:text-slate-400 disabled:pointer-events-none"
                  >
                    Beri Nilai
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Modal Penilaian */}
      {selectedColleague && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300 p-3 sm:p-4 overflow-y-auto flex items-end md:items-center justify-center">
          <div className="bg-white w-full max-w-md rounded-[2rem] animate-in slide-in-from-bottom-10 duration-300 shadow-2xl overflow-hidden">

            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-black text-slate-800 tracking-tight">
                {confirmStep ? (
                  "Konfirmasi Penilaian"
                ) : (
                  <>Nilai <span className="text-sky-600">{selectedColleague.name}</span></>
                )}
              </h2>
              <button
                onClick={closeModal}
                disabled={isSubmitting}
                className="w-8 h-8 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto max-h-[calc(100dvh-8rem)]">
              {/* ─── Step 1: Form ─────────────────────────────────── */}
              {!confirmStep && (
                <div className="space-y-6">
                  {/* Star Rating */}
                  <div className="text-center py-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">
                      Seberapa baik kerjasama tim rekan ini?
                    </p>
                    <div className="flex justify-center gap-3">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          onMouseEnter={() => setHoverRating(s)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => setRating(s)}
                          className="transition-transform active:scale-90"
                        >
                          <Star
                            size={42}
                            className={cn(
                              "transition-colors",
                              displayRating >= s
                                ? "text-amber-500 fill-amber-500"
                                : "text-slate-200",
                            )}
                          />
                        </button>
                      ))}
                    </div>
                    {displayRating > 0 && (
                      <p className="text-xs font-black text-amber-600 mt-2 uppercase tracking-widest">
                        {STAR_LABELS[displayRating]}
                      </p>
                    )}
                  </div>

                  {/* Comment */}
                  <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Komentar / Masukan (Opsional)
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Berikan apresiasi atau masukan yang membangun..."
                      className="mt-2 w-full rounded-3xl border border-slate-200/60 px-5 py-4 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 transition-all outline-none resize-none h-32"
                    />
                  </label>

                  <button
                    onClick={handleRequestConfirm}
                    disabled={rating === 0}
                    className="w-full py-4 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-sky-200/60 transition-all disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Kirim Penilaian
                  </button>
                </div>
              )}

              {/* ─── Step 2: Confirmation Summary ─────────────────── */}
              {confirmStep && (
                <div className="space-y-5">
                  {/* Summary card */}
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-sky-100 rounded-full flex items-center justify-center text-sky-500">
                        <User size={20} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Dinilai
                        </p>
                        <p className="font-black text-slate-800">{selectedColleague.name}</p>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-3 flex items-center gap-2">
                      <div className="flex gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            size={18}
                            className={cn(
                              i < rating
                                ? "text-amber-500 fill-amber-500"
                                : "text-slate-200",
                            )}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-black text-amber-600 uppercase tracking-widest">
                        {STAR_LABELS[rating]}
                      </span>
                    </div>

                    {comment.trim() && (
                      <div className="border-t border-slate-200 pt-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                          Komentar
                        </p>
                        <p className="text-sm text-slate-600 leading-relaxed">{comment.trim()}</p>
                      </div>
                    )}
                  </div>

                  {/* Warning */}
                  <div className="flex gap-2.5 p-3 rounded-xl border bg-amber-50 border-amber-100">
                    <AlertCircle size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 leading-relaxed">
                      Penilaian yang sudah dikirim tidak dapat diubah atau dibatalkan.
                    </p>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => setConfirmStep(false)}
                      disabled={isSubmitting}
                      className="flex-1 py-4 rounded-2xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-50"
                    >
                      Ubah
                    </button>
                    <button
                      onClick={handleConfirmSubmit}
                      disabled={isSubmitting}
                      className="flex-1 py-4 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-sky-200/60 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Mengirim…
                        </>
                      ) : (
                        "Ya, Kirim"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
