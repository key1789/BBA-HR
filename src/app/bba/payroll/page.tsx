import { redirect } from "next/navigation";

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{
    tenant?: string;
    month?: string;
    year?: string;
  }>;
}) {
  const params = await searchParams;

  // Publish, unpublish, dan recalculate sudah dipindah ke halaman Audit.
  // Redirect ke audit page dengan tenant dan periode yang sama.
  const qs = new URLSearchParams();
  if (params.month) qs.set("month", params.month);
  if (params.year) qs.set("year", params.year);

  if (params.tenant) {
    redirect(`/bba/audit/${params.tenant}${qs.size ? `?${qs.toString()}` : ""}`);
  }

  redirect(`/bba/audit${qs.size ? `?${qs.toString()}` : ""}`);
}
