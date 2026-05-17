import { acknowledgeAnnouncementAction } from "@/actions/announcements";
import {
  ANNOUNCEMENT_PRIORITY_LABEL,
  getAnnouncementPriorityBadge,
  type AnnouncementPriority,
} from "@/lib/announcements";

export type AnnouncementInboxItem = {
  id: string;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  require_ack: boolean;
  published_at: string | null;
  expire_at: string | null;
  viewed_at: string | null;
  acknowledged_at: string | null;
};

export function AnnouncementInbox({
  items,
  audienceLabel,
}: {
  items: AnnouncementInboxItem[];
  audienceLabel: string;
}) {
  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-black text-slate-800">Inbox Pengumuman</h2>
        <p className="mt-1 text-sm text-slate-500">
          Menampilkan pengumuman aktif untuk {audienceLabel}. Pengumuman kritis memerlukan acknowledgment.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Tidak ada pengumuman aktif untuk saat ini.
        </div>
      ) : null}

      {items.map((item) => (
        <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-xs font-bold ${getAnnouncementPriorityBadge(item.priority)}`}>
              {ANNOUNCEMENT_PRIORITY_LABEL[item.priority]}
            </span>
            {item.require_ack ? (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">Wajib Ack</span>
            ) : null}
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
              {item.viewed_at ? "Sudah dibuka" : "Belum dibuka"}
            </span>
            {item.acknowledged_at ? (
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                Sudah ack
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 text-base font-black text-slate-800">{item.title}</h3>
          <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{item.body}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <p>Published: {item.published_at ? new Date(item.published_at).toLocaleString("id-ID") : "-"}</p>
            <p>Expire: {item.expire_at ? new Date(item.expire_at).toLocaleString("id-ID") : "-"}</p>
          </div>
          {item.require_ack && !item.acknowledged_at ? (
            <form action={acknowledgeAnnouncementAction} className="mt-4">
              <input type="hidden" name="announcementId" value={item.id} />
              <button
                type="submit"
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white"
              >
                Saya Sudah Baca
              </button>
            </form>
          ) : null}
        </article>
      ))}
    </section>
  );
}
