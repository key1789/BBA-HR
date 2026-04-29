import { getSessionContext } from "@/lib/auth-context";
import { getDefaultPortalPath } from "@/lib/portal";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await getSessionContext();
  const role = session?.activeMembership?.role;
  redirect(role ? getDefaultPortalPath(role) : "/login");
}
