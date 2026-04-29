import { PortalPage } from "@/components/shared/portal-page";

export default function OwnerDetailPage() {
  return (
    <PortalPage
      title="Owner - Detail Data"
      subtitle="Drill-down data detail lintas modul operasional."
      items={[
        "Detail submission dan verifikasi",
        "Detail kontribusi leaderboard",
        "Revisi payroll tersedia saat payroll diaktifkan",
      ]}
    />
  );
}
