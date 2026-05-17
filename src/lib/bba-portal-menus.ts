/** Kunci menu portal BBA — sinkron dengan path & undangan. */
export const BBA_PORTAL_MENU_KEYS = [
  "dashboard",
  "owners",
  "branches",
  "products",
  "audit",
  "export",
  "broadcast",
  "admins",
] as const;

export type BbaPortalMenuKey = (typeof BBA_PORTAL_MENU_KEYS)[number];

export const BBA_PORTAL_MENU_REGISTRY: {
  key: BbaPortalMenuKey;
  label: string;
  pathPrefix: string;
}[] = [
  { key: "dashboard", label: "Dashboard", pathPrefix: "/bba/dashboard" },
  { key: "owners", label: "Kelola Data Owner", pathPrefix: "/bba/owners" },
  { key: "owners", label: "Kelola Owner", pathPrefix: "/bba/kelola-owner" },
  { key: "branches", label: "Manajemen Apotek", pathPrefix: "/bba/master-apotek" },
  { key: "branches", label: "Manajemen Apotek", pathPrefix: "/bba/branches" },
  { key: "products", label: "Master Produk Fokus", pathPrefix: "/bba/products" },
  { key: "audit", label: "Approval & Audit", pathPrefix: "/bba/audit" },
  { key: "export", label: "Pusat Unduhan", pathPrefix: "/bba/export-center" },
  { key: "export", label: "Pusat Unduhan", pathPrefix: "/bba/export" },
  { key: "broadcast", label: "Pusat Pengumuman", pathPrefix: "/bba/broadcast" },
  { key: "admins", label: "Kelola Super Admin", pathPrefix: "/bba/admins" },
];

const sortedByPathLengthDesc = [...BBA_PORTAL_MENU_REGISTRY].sort(
  (a, b) => b.pathPrefix.length - a.pathPrefix.length,
);

export function isKnownBbaPortalMenuKey(key: string): key is BbaPortalMenuKey {
  return (BBA_PORTAL_MENU_KEYS as readonly string[]).includes(key);
}

/** Map pathname ke menu_key; null jika di luar daftar (mis. /bba saja). */
export function bbaPathnameToMenuKey(pathname: string): BbaPortalMenuKey | null {
  const n = pathname.replace(/\/+$/, "") || pathname;
  if (n === "/bba" || n === "") return null;
  for (const def of sortedByPathLengthDesc) {
    if (n === def.pathPrefix || n.startsWith(`${def.pathPrefix}/`)) {
      return def.key;
    }
  }
  return null;
}

/** Urutan fallback redirect jika path tidak diizinkan. */
export function firstAllowedBbaPath(menuKeys: Set<string>): string | null {
  for (const key of BBA_PORTAL_MENU_KEYS) {
    if (!menuKeys.has(key)) continue;
    const def = BBA_PORTAL_MENU_REGISTRY.find((d) => d.key === key);
    if (def) return def.pathPrefix;
  }
  return null;
}

export function menuKeySetFromList(keys: string[] | null | undefined): Set<string> {
  return new Set((keys ?? []).filter((k) => isKnownBbaPortalMenuKey(k)));
}
