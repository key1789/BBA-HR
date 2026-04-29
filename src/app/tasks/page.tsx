import { getSessionContext } from "@/lib/auth-context";
import { LegacyRouteNotice } from "@/components/shared/legacy-route-notice";

export default async function TasksPage() {
  const session = await getSessionContext();
  return (
    <LegacyRouteNotice
      title="Tasks & Approval"
      activeRole={session?.activeMembership?.role}
    />
  );
}
