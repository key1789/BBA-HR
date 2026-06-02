import { getSessionContext } from "@/lib/auth-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnnouncementInbox, type AnnouncementInboxItem } from "@/components/announcements/announcement-inbox";
import { markAnnouncementViewedAction } from "@/actions/announcements";
import { redirect } from "next/navigation";
import { publishDueAnnouncementsAction } from "@/app/bba/broadcast/actions";
import { AnimatedPage } from "@/components/shared/animated-page";
import { Bell } from "lucide-react";

type ReceiptRow = {
  viewed_at: string | null;
  acknowledged_at: string | null;
  announcement:
    | {
        id: string;
        title: string;
        body: string;
        priority: "info" | "attention" | "required" | "urgent";
        require_ack: boolean;
        published_at: string | null;
        expire_at: string | null;
        status: "published" | "draft" | "scheduled" | "archived";
      }
    | {
        id: string;
        title: string;
        body: string;
        priority: "info" | "attention" | "required" | "urgent";
        require_ack: boolean;
        published_at: string | null;
        expire_at: string | null;
        status: "published" | "draft" | "scheduled" | "archived";
      }[]
    | null;
};

function normalizeAnnouncement(row: ReceiptRow) {
  if (Array.isArray(row.announcement)) return row.announcement[0] ?? null;
  return row.announcement;
}

export default async function CrewAnnouncementPage() {
  const session = await getSessionContext();
  const active = session?.activeMembership;
  if (!session || !active || (active.role !== "crew" && active.role !== "admin_apotek")) redirect("/");

  await publishDueAnnouncementsAction();

  const roleFilter = active.role === "admin_apotek" ? "admin_apotek" : "crew";
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("announcement_receipts")
    .select(
      "viewed_at, acknowledged_at, announcement:announcement_id(id, title, body, priority, require_ack, published_at, expire_at, status)",
    )
    .eq("user_id", session.userId)
    .eq("role", roleFilter)
    .eq("announcement.status", "published")
    .or(`tenant_apotek_id.eq.${active.tenantId},tenant_apotek_id.is.null`)
    .order("created_at", { ascending: false });

  const rows = ((data ?? []) as unknown[]).map((row) => row as ReceiptRow);
  const items = rows
    .map((row) => ({ ...row, announcement: normalizeAnnouncement(row) }))
    .filter((row) => row.announcement && row.announcement.status === "published")
    .filter((row) => !row.announcement?.expire_at || new Date(row.announcement.expire_at) > new Date())
    .map((row) => ({
      id: row.announcement!.id,
      title: row.announcement!.title,
      body: row.announcement!.body,
      priority: row.announcement!.priority,
      require_ack: row.announcement!.require_ack,
      published_at: row.announcement!.published_at,
      expire_at: row.announcement!.expire_at,
      viewed_at: row.viewed_at,
      acknowledged_at: row.acknowledged_at,
    })) as AnnouncementInboxItem[];

  const unseenIds = items.filter((item) => !item.viewed_at).map((item) => item.id);
  await Promise.all(unseenIds.map((id) => markAnnouncementViewedAction(id)));

  return (
    <AnimatedPage className="space-y-4 pb-10">
      <div className="bg-white rounded-3xl p-5 shadow-md border border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-600 rounded-2xl flex items-center justify-center shadow-sm shrink-0">
            <Bell size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">Pengumuman</h1>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Info operasional dari BBA</p>
          </div>
        </div>
      </div>
      <AnnouncementInbox items={items} audienceLabel={roleFilter === "crew" ? "Crew" : "Admin Apotek"} />
    </AnimatedPage>
  );
}
