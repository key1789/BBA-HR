import { redirect } from "next/navigation";

// Leaderboard sudah tersedia di tab Peringkat halaman Rapor
// dengan tampilan yang lebih lengkap (podium, medal, progress bar)
export default function CrewLeaderboardPage() {
  redirect("/crew/rapor?tab=peringkat");
}
