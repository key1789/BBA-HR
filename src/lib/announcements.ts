export const ANNOUNCEMENT_PRIORITIES = ["info", "attention", "required", "urgent"] as const;
export const ANNOUNCEMENT_STATUSES = ["draft", "scheduled", "published", "archived"] as const;
export const ANNOUNCEMENT_TARGET_ROLES = ["admin_apotek", "crew"] as const;

export type AnnouncementPriority = (typeof ANNOUNCEMENT_PRIORITIES)[number];
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];
export type AnnouncementTargetRole = (typeof ANNOUNCEMENT_TARGET_ROLES)[number];

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  require_ack: boolean;
  publish_at: string | null;
  expire_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export const ANNOUNCEMENT_PRIORITY_LABEL: Record<AnnouncementPriority, string> = {
  info: "Info",
  attention: "Perlu Perhatian",
  required: "Wajib Baca",
  urgent: "Urgent",
};

export const ANNOUNCEMENT_STATUS_LABEL: Record<AnnouncementStatus, string> = {
  draft: "Draft",
  scheduled: "Terjadwal",
  published: "Aktif",
  archived: "Arsip",
};

export function inferRequireAck(priority: AnnouncementPriority): boolean {
  return priority === "required" || priority === "urgent";
}

export function getAnnouncementPriorityBadge(priority: AnnouncementPriority): string {
  if (priority === "urgent") return "bg-rose-100 text-rose-700 border border-rose-200";
  if (priority === "required") return "bg-amber-100 text-amber-700 border border-amber-200";
  if (priority === "attention") return "bg-indigo-100 text-indigo-700 border border-indigo-200";
  return "bg-slate-100 text-slate-700 border border-slate-200";
}
