"use client";

import { useState } from "react";
import { Star, CheckCircle2, User, X } from "lucide-react";
import { Button } from "@/components/shared/button";
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

export function ReviewRekanClient({ colleagues, myReviews, limitPerMonth }: Props) {
  const [selectedColleague, setSelectedColleague] = useState<Colleague | null>(null);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reviewsGivenCount = myReviews.length;
  const isLimitReached = reviewsGivenCount >= limitPerMonth;
  const remainingReviews = Math.max(limitPerMonth - reviewsGivenCount, 0);

  const handleSubmit = async () => {
    if (!selectedColleague || rating === 0) return;
    
    setIsSubmitting(true);
    try {
      const result = await submitPeerReviewAction({
        revieweeId: selectedColleague.id,
        rating,
        comment
      });
      
      if (result.success) {
        toast.success("Penilaian berhasil dikirim.");
        setSelectedColleague(null);
        setRating(0);
        setComment("");
      } else {
        toast.error(result.error || "Gagal mengirim review");
      }
    } catch (err) {
      console.error(err);
      toast.error("Terjadi kesalahan saat mengirim review.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getReviewForColleague = (colleagueId: string) => {
    return myReviews.find(r => r.reviewee_user_id === colleagueId);
  };

  return (
    <div className="space-y-6">
      {/* 1. Dashboard Info */}
      <div className="bg-gradient-to-br from-sky-600 to-sky-700 rounded-3xl p-6 text-white shadow-lg flex items-center justify-between">
        <div>
          <p className="text-sky-100 text-[10px] font-black uppercase tracking-widest mb-1">Status Penilaian Bulan Ini</p>
          <h2 className="text-2xl font-black">{reviewsGivenCount} <span className="text-sky-200 text-sm font-bold">/ {limitPerMonth} Penilaian</span></h2>
          <p className="text-sky-100 text-xs font-bold mt-1">
            Sisa kuota: {remainingReviews}
          </p>
          {isLimitReached ? (
            <p className="text-amber-200 text-[11px] font-bold mt-1">
              Kuota bulan ini sudah habis.
            </p>
          ) : null}
        </div>
        <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
          <Star className="text-white fill-white" size={28} />
        </div>
      </div>

      {/* 2. Daftar Rekan */}
      <div className="space-y-4">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest px-2">Rekan Satu Tim</h3>
        <div className="grid grid-cols-1 gap-3">
          {colleagues.map((col) => {
            const review = getReviewForColleague(col.id);
            const isReviewed = !!review;

            return (
              <div 
                key={col.id} 
                className={cn(
                  "bg-white rounded-3xl p-5 border transition-all flex items-center justify-between",
                  isReviewed ? "border-emerald-100 bg-emerald-50/30" : "border-slate-100 shadow-sm hover:shadow-md"
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
                          <Star key={i} size={12} className={cn(i < review.rating ? "text-amber-500 fill-amber-500" : "text-slate-200")} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Belum dinilai</p>
                    )}
                  </div>
                </div>

                {isReviewed ? (
                  <div className="bg-emerald-100 text-emerald-600 p-2 rounded-xl">
                    <CheckCircle2 size={20} />
                  </div>
                ) : (
                  <Button 
                    onClick={() => setSelectedColleague(col)}
                    disabled={isLimitReached}
                    className="rounded-2xl px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-sky-600 text-white hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    Beri Nilai
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Modal Penilaian */}
      {selectedColleague && (
        <div className="fixed inset-0 z-[100] bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300 p-3 sm:p-4 overflow-y-auto flex items-end md:items-center justify-center">
          <div className="bg-white w-full max-w-2xl rounded-[2rem] animate-in slide-in-from-bottom-10 duration-300 shadow-2xl max-h-[calc(100vh-1.5rem)] md:max-h-[calc(100vh-3rem)] overflow-hidden">
            <div className="p-6 pb-4 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-black text-slate-800 text-lg tracking-tight">Nilai <span className="text-sky-600">{selectedColleague.name}</span></h2>
              <button onClick={() => setSelectedColleague(null)} className="w-8 h-8 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center"><X size={18}/></button>
            </div>
            <div className="p-6 pb-24 md:pb-6 overflow-y-auto max-h-[calc(100vh-7rem)] md:max-h-[calc(100vh-10rem)]">
            <div className="space-y-6">
              {/* Star Rating Section */}
              <div className="text-center py-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Seberapa baik kerjasama tim rekan ini?</p>
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
                          (hoverRating || rating) >= s ? "text-amber-500 fill-amber-500" : "text-slate-200"
                        )} 
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment Section */}
              <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                Komentar / Masukan (Opsional)
                <textarea 
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Berikan apresiasi atau masukan yang membangun..."
                  className="mt-2 w-full rounded-3xl border border-slate-200/60 px-5 py-4 text-sm font-bold text-slate-800 bg-slate-50 focus:bg-white focus:border-sky-500 focus:ring-4 focus:ring-sky-500/10 transition-all outline-none resize-none h-32"
                />
              </label>

              <Button 
                onClick={handleSubmit}
                disabled={rating === 0 || isSubmitting}
                className="w-full py-5 rounded-full bg-gradient-to-r from-sky-500 to-sky-600 text-white font-black uppercase tracking-widest text-sm shadow-[0_8px_20px_-6px_rgba(2,132,199,0.5)] active:scale-95 transition-all"
              >
                {isSubmitting ? "Mengirim..." : "Kirim Penilaian"}
              </Button>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
