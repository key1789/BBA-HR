type InlineAlertProps = {
  tone?: "success" | "error" | "warning" | "info";
  message: string;
};

const toneClass = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

export function InlineAlert({ tone = "info", message }: InlineAlertProps) {
  return <div className={`rounded-xl border px-4 py-3 text-sm ${toneClass[tone]}`}>{message}</div>;
}
