import type { SupabaseClient } from "@supabase/supabase-js";
import { getSessionContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { clampViewMonthYear } from "@/lib/bba-dashboard-metrics";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";

export type OwnerPortalSessionOk = {
  supabase: SupabaseClient;
  ownerMemberships: { tenantId: string; tenantCode: string; tenantName: string }[];
  activeOwnerMembership: { tenantId: string; tenantCode: string; tenantName: string };
  month: number;
  year: number;
  dateParam: string;
  tenantOptions: { id: string; code: string; name: string }[];
};

export async function getOwnerPortalContext(params: {
  tenant?: string;
  month?: string;
  year?: string;
  date?: string;
}): Promise<{ ok: false; reason: "auth" | "no_owner" } | { ok: true; data: OwnerPortalSessionOk }> {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!session || !active || active.role !== "owner") {
    return { ok: false, reason: "auth" };
  }

  const ownerMemberships = (session.memberships ?? []).filter((m) => m.role === "owner");
  if (ownerMemberships.length === 0) {
    return { ok: false, reason: "no_owner" };
  }

  const tenantParam = params.tenant?.trim();
  const allowedTenant =
    tenantParam && ownerMemberships.some((m) => m.tenantId === tenantParam)
      ? tenantParam
      : active.tenantId;
  const activeOwnerMembership =
    ownerMemberships.find((m) => m.tenantId === allowedTenant) ?? ownerMemberships[0]!;

  const reminderWindow = getOperationalReminderWindow();
  const wibTodayParts = reminderWindow.dateKey.split("-").map((p) => parseInt(p, 10));
  const todayYear = wibTodayParts[0] ?? new Date().getFullYear();
  const todayMonth = wibTodayParts[1] ?? new Date().getMonth() + 1;
  const rawMonth = parseInt(params.month ?? "", 10);
  const rawYear = parseInt(params.year ?? "", 10);
  const { month, year } = clampViewMonthYear(
    Number.isFinite(rawMonth) ? rawMonth : todayMonth,
    Number.isFinite(rawYear) ? rawYear : todayYear,
  );
  const dateParam = typeof params.date === "string" ? params.date.slice(0, 10) : "";

  const supabase = await createClient();
  const tenantOptions = ownerMemberships.map((m) => ({
    id: m.tenantId,
    code: m.tenantCode,
    name: m.tenantName,
  }));

  return {
    ok: true,
    data: {
      supabase,
      ownerMemberships,
      activeOwnerMembership,
      month,
      year,
      dateParam,
      tenantOptions,
    },
  };
}
