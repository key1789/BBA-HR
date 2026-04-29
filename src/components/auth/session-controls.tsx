import { logoutAction } from "@/app/actions/auth";
import { TenantMembership } from "@/lib/auth-context";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

type Props = {
  userEmail?: string;
  memberships: TenantMembership[];
  activeTenantId?: string;
};

export function SessionControls({ userEmail, memberships, activeTenantId }: Props) {
  const activeOption = memberships.find(
    (item) => item.tenantId === activeTenantId,
  );

  async function setActiveTenant(formData: FormData) {
    "use server";
    const selection = formData.get("tenantIdRole")?.toString();

    if (!selection) {
      return;
    }

    const [tenantId, role] = selection.split("::");

    const isAllowed = memberships.some(
      (item) => item.tenantId === tenantId && item.role === role,
    );
    if (!isAllowed) {
      return;
    }

    const cookieStore = await cookies();
    cookieStore.set("bba_tenant_id", tenantId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
    });
    cookieStore.set("bba_active_role", role, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
    });
    revalidatePath("/", "layout");
  }

  if (!userEmail) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {memberships.length > 0 ? (
        <form action={setActiveTenant} className="flex items-center gap-2">
          <select
            name="tenantIdRole"
            defaultValue={
              activeOption
                ? `${activeOption.tenantId}::${activeOption.role}`
                : undefined
            }
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700"
          >
            {memberships.map((membership) => (
              <option
                key={`${membership.tenantId}-${membership.role}`}
                value={`${membership.tenantId}::${membership.role}`}
              >
                {membership.tenantCode} ({membership.role})
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white"
          >
            Switch
          </button>
        </form>
      ) : null}
      <span className="hidden text-xs text-slate-600 md:inline">{userEmail}</span>
      <form action={logoutAction}>
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700"
        >
          Logout
        </button>
      </form>
    </div>
  );
}
