import { redirect } from "next/navigation";

// Input harian crew tidak lagi dibutuhkan di portal admin.
// Admin hanya melakukan verifikasi data crew dan input review pelanggan.
export default function AdminInputHarianPage() {
  redirect("/admin/dashboard");
}
