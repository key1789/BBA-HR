import { getSessionContext } from "@/lib/auth-context";
import { LegacyRouteNotice } from "@/components/shared/legacy-route-notice";

export default async function RequestsPage() {
  const session = await getSessionContext();
  return <LegacyRouteNotice title="Workforce Requests" activeRole={session?.activeMembership?.role} />;
}
