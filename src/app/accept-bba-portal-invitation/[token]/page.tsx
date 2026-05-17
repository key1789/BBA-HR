import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AcceptBbaPortalInvitationClient } from "@/app/accept-bba-portal-invitation/[token]/accept-bba-portal-invitation-client";
import { CheckCircle2 } from "lucide-react";

export default async function AcceptBbaPortalInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabaseAdmin = createAdminClient();

  const { data: invitation, error } = await supabaseAdmin
    .from("bba_portal_staff_invitations")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (error || !invitation) {
    notFound();
  }

  const now = new Date();
  const expired = new Date(invitation.expires_at) < now;

  if (invitation.status === "accepted") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Akun portal BBA sudah aktif</h1>
          <p className="text-sm text-slate-500">
            Undangan ini telah digunakan. Silakan login dengan email{" "}
            <span className="font-semibold text-slate-700">{invitation.email}</span>.
          </p>
          <Link
            href="/login"
            className="inline-block px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700"
          >
            Ke halaman login
          </Link>
        </div>
      </div>
    );
  }

  if (invitation.status === "cancelled") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-4">
          <h1 className="text-xl font-bold text-slate-800">Undangan dibatalkan</h1>
          <p className="text-sm text-slate-500">Hubungi super admin global untuk undangan baru.</p>
          <Link href="/login" className="inline-block px-6 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold text-sm">
            Kembali ke login
          </Link>
        </div>
      </div>
    );
  }

  if (invitation.status === "expired" || expired) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <span className="text-2xl font-bold">!</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800">Undangan kadaluwarsa</h1>
          <p className="text-sm text-slate-500">Silakan minta undangan baru dari super admin global.</p>
          <Link href="/login" className="inline-block px-6 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold text-sm">
            Kembali ke login
          </Link>
        </div>
      </div>
    );
  }

  if (invitation.status !== "pending") {
    notFound();
  }

  return <AcceptBbaPortalInvitationClient invitation={invitation} token={token} />;
}
