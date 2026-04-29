import { getSessionContext } from "@/lib/auth-context";
import { LegacyRouteNotice } from "@/components/shared/legacy-route-notice";

export default async function CandidatesPage() {
  const session = await getSessionContext();
  return <LegacyRouteNotice title="Candidates" activeRole={session?.activeMembership?.role} />;
}
