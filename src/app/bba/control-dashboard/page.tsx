import { PortalPage } from "@/components/shared/portal-page";

export default function BbaControlDashboardPage() {
  return (
    <PortalPage
      title="BBA Control Dashboard"
      subtitle="Pusat kontrol operasional lintas apotek."
      items={[
        "Ringkasan performa lintas tenant",
        "Shortcut master apotek, audit, export",
        "Monitoring readiness payroll hidden",
      ]}
    />
  );
}
