import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  variant?: "light" | "dark" | "emerald";
  interactive?: boolean;
}

export function GlassCard({ children, className, variant = "light", interactive = false }: GlassCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-2xl p-6 overflow-hidden",
        "border shadow-sm",
        // Variants - Now Solid Corporate Style
        variant === "light" && "bg-white border-slate-200",
        variant === "dark" && "bg-slate-900 border-slate-800 text-white",
        variant === "emerald" && "bg-emerald-50 border-emerald-100",
        // Interactive state
        interactive && "transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:border-indigo-200 cursor-pointer",
        className
      )}
    >
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
