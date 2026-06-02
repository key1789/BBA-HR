import { redirect } from "next/navigation";

export default async function OwnerLaporanRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = new URLSearchParams();
  if (typeof params.tenant === "string") q.set("tenant", params.tenant);
  const qs = q.toString();
  redirect(`/owner/dashboard${qs ? `?${qs}` : ""}`);
}
