import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const variantClass: Record<Variant, string> = {
  primary:   "bg-slate-900 text-white hover:bg-slate-800",
  secondary: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
  danger:    "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
  ghost:     "text-slate-700 hover:bg-slate-100",
};

const sizeClass: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[10px] tracking-widest uppercase",
  md: "px-4 py-2.5 text-xs    tracking-widest uppercase",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-xl font-black transition disabled:opacity-50 ${sizeClass[size]} ${variantClass[variant]} ${className}`}
      {...props}
    />
  );
}
