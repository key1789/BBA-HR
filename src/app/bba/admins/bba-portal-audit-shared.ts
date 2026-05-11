/** Label & mapping untuk log audit portal BBA (dipakai server + client). */

export const AUDIT_PAGE_SIZE = 50;
/** Batas aman export server-side (CSV). */
export const AUDIT_EXPORT_MAX = 3000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `yyyy-mm-dd` → batas UTC inklusif. Kosongkan salah satu untuk open-ended. */
export function parseAuditDateRange(from?: string | null, to?: string | null): {
  fromIso?: string;
  toIso?: string;
  error?: string;
} {
  const f = from?.trim() ?? "";
  const t = to?.trim() ?? "";
  if (!f && !t) return {};
  if (f && !DATE_RE.test(f)) return { error: "Format tanggal mulai tidak valid (gunakan yyyy-mm-dd)." };
  if (t && !DATE_RE.test(t)) return { error: "Format tanggal akhir tidak valid (gunakan yyyy-mm-dd)." };
  if (f && t && f > t) return { error: "Tanggal mulai tidak boleh setelah tanggal akhir." };
  return {
    fromIso: f ? `${f}T00:00:00.000Z` : undefined,
    toIso: t ? `${t}T23:59:59.999Z` : undefined,
  };
}

export function escapeCsvField(s: string): string {
  const t = s.replace(/\r\n/g, "\n");
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  deactivate_account: "Nonaktifkan akun",
  activate_account: "Aktifkan akun",
  promote_global: "Promote global",
  demote_global: "Cabut global",
  invite_analyst: "Undang analyst",
  cancel_invitation: "Batalkan undangan",
  update_analyst_access: "Ubah cakupan analyst",
  analyst_invite_accepted: "Undangan analyst diterima",
};

export type AuditDisplayRow = {
  id: string;
  created_at: string;
  actionKey: string;
  actionLabel: string;
  actorName: string;
  detail: string;
  targetUserId: string | null;
  metadata: unknown | null;
};

export function formatAuditDetail(row: {
  target_user_id?: string | null;
  metadata?: unknown;
}): string {
  const parts: string[] = [];
  if (row.target_user_id) parts.push(`user:${String(row.target_user_id).slice(0, 8)}…`);
  if (row.metadata && typeof row.metadata === "object" && row.metadata !== null && "email" in row.metadata) {
    const e = (row.metadata as { email?: string }).email;
    if (e) parts.push(e);
  }
  return parts.join(" · ") || "—";
}

export function toAuditDisplayRow(row: Record<string, unknown>, actorNameById: Map<string, string>): AuditDisplayRow {
  const action = String(row.action ?? "");
  const actorId = row.actor_user_id as string | null | undefined;
  const tid = row.target_user_id;
  const targetUserId = tid != null && String(tid).length > 0 ? String(tid) : null;
  return {
    id: String(row.id),
    created_at: String(row.created_at),
    actionKey: action,
    actionLabel: AUDIT_ACTION_LABEL[action] ?? action,
    actorName: actorId ? actorNameById.get(actorId) ?? "—" : "Sistem",
    detail: formatAuditDetail({
      target_user_id: targetUserId ?? undefined,
      metadata: row.metadata,
    }),
    targetUserId,
    metadata: row.metadata ?? null,
  };
}
