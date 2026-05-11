import { createAdminClient } from "@/lib/supabase/admin";
import { notFound } from "next/navigation";
import { SetPasswordByLinkClient } from "./set-password-by-link-client";

export default async function SetPasswordByLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabaseAdmin = createAdminClient();

  const { data: link, error } = await supabaseAdmin
    .from("staff_password_reset_links")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .maybeSingle();

  if (error || !link) notFound();

  if (new Date(link.expires_at) < new Date()) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
            <span className="text-2xl font-bold">!</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800">Link Kadaluwarsa</h1>
          <p className="text-sm text-slate-500">Link ganti password ini sudah tidak berlaku. Silakan minta admin untuk membuat link baru.</p>
          <a href="/login" className="inline-block px-6 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold text-sm">Kembali ke Login</a>
        </div>
      </div>
    );
  }

  return <SetPasswordByLinkClient token={token} />;
}
