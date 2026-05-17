"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? "";
  const [active, setActive] = useState(false);

  useEffect(() => {
    setActive(false);
  }, [pathname, search]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor?.href) return;
      if (anchor.hasAttribute("download") || anchor.target === "_blank") return;

      try {
        const next = new URL(anchor.href, window.location.origin);
        if (next.origin !== window.location.origin) return;

        const currentSearch = search ? `?${search}` : "";
        const sameRoute = next.pathname === pathname && next.search === currentSearch;
        if (sameRoute) return;

        setActive(true);
      } catch {
        /* ignore malformed href */
      }
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname, search]);

  return (
    <div
      aria-hidden={!active}
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[200] h-1 overflow-hidden transition-opacity duration-200",
        active ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="nav-progress-bar h-full bg-gradient-to-r from-indigo-600 via-sky-400 to-indigo-600" />
    </div>
  );
}
