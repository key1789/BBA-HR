import { redirect } from "next/navigation";

export default async function OwnerPenjualanKinerjaRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = new URLSearchParams();
  if (typeof params.month === "string") q.set("month", params.month);
  if (typeof params.year === "string") q.set("year", params.year);
  if (typeof params.tenant === "string") q.set("tenant", params.tenant);
  const qs = q.toString();
  redirect(`/owner/dashboard${qs ? `?${qs}` : ""}`);
}
