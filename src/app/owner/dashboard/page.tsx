import { redirect } from "next/navigation";

/** URL lama & pintu masuk default: arahkan ke menu pertama portal owner. */
export default async function OwnerDashboardRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const sp = new URLSearchParams();
  const pick = (k: string) => {
    const v = raw[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
  };
  const month = pick("month");
  const year = pick("year");
  const date = pick("date");
  const tenant = pick("tenant");
  if (month) sp.set("month", month);
  if (year) sp.set("year", year);
  if (date) sp.set("date", date);
  if (tenant) sp.set("tenant", tenant);
  const q = sp.toString();
  redirect(q ? `/owner/penjualan-kinerja?${q}` : "/owner/penjualan-kinerja");
}
