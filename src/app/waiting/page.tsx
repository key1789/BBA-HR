import { Card } from "@/components/shared/card";
import { Clock } from "lucide-react";
import { logoutAction } from "@/actions/auth";

export default function WaitingApprovalPage() {
  return (
    <section className="mx-auto w-full max-w-md flex items-center justify-center min-h-[80vh]">
      <Card className="space-y-6 p-8 text-center border-amber-100 bg-amber-50/30">
        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
          <Clock size={32} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Menunggu Persetujuan</h1>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            Akun Anda berhasil dibuat, namun belum dihubungkan ke cabang apotek manapun. Silakan hubungi Super Admin BBA untuk persetujuan dan penempatan.
          </p>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="w-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold py-2 px-4 rounded-xl text-sm transition-colors">
            Keluar
          </button>
        </form>
      </Card>
    </section>
  );
}
