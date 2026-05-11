import { getSessionContext } from "@/lib/auth-context";
import { getDefaultPortalPath } from "@/lib/portal";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getSessionContext();
  const activeRole = session?.activeMembership?.role;
  
  if (activeRole) {
    redirect(getDefaultPortalPath(activeRole));
  } else {
    redirect("/login");
  }
}
