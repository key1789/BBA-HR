"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import type { AnnouncementPriority, AnnouncementRow, AnnouncementTargetRole } from "@/lib/announcements";
import { ANNOUNCEMENT_PRIORITY_LABEL } from "@/lib/announcements";
import { saveAnnouncementAction } from "./actions";

type TenantOption = { id: string; name: string; code: string };
type AnnouncementTarget = { target_role: AnnouncementTargetRole; tenant_apotek_id: string | null };

function SubmitButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="actionType"
      value={value}
      disabled={pending}
      className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider disabled:opacity-50 ${className ?? "border border-slate-300 text-slate-700"}`}
    >
      {pending ? "Menyimpan..." : label}
    </button>
  );
}

export function BroadcastComposer({
  tenants,
  editing,
}: {
  tenants: TenantOption[];
  editing?: (AnnouncementRow & { targets: AnnouncementTarget[] }) | null;
}) {
  const [state, action] = useActionState(saveAnnouncementAction, null);
  const initialTargets = editing?.targets ?? [{ target_role: "admin_apotek", tenant_apotek_id: null }];
  const [title, setTitle] = useState(editing?.title ?? "");
  const [body, setBody] = useState(editing?.body ?? "");

  const [targetRole, setTargetRole] = useState<AnnouncementTargetRole>(initialTargets[0]?.target_role ?? "admin_apotek");
  const [targetScope, setTargetScope] = useState(initialTargets[0]?.tenant_apotek_id ? "tenant" : "all");
  const [tenantIds, setTenantIds] = useState<string[]>(
    initialTargets.map((item) => item.tenant_apotek_id).filter((item): item is string => !!item),
  );
  const [priority, setPriority] = useState<AnnouncementPriority>(editing?.priority ?? "info");
  const templates: Array<{ label: string; title: string; body: string; priority: AnnouncementPriority }> = [
    {
      label: "Perubahan SOP",
      title: "Pembaruan SOP Operasional",
      body: "Mulai besok, SOP operasional diperbarui. Mohon seluruh tim membaca detail perubahan dan menyesuaikan proses kerja.",
      priority: "required",
    },
    {
      label: "Cut-off Harian",
      title: "Reminder Cut-off Input Harian",
      body: "Pengingat: pastikan input harian selesai sebelum cut-off hari ini untuk menghindari backlog verifikasi.",
      priority: "attention",
    },
    {
      label: "Insiden Urgent",
      title: "Tindakan Segera Diperlukan",
      body: "Terdapat isu operasional yang memerlukan respons segera. Ikuti instruksi mitigasi pada pengumuman ini.",
      priority: "urgent",
    },
  ];

  const targetPayload = useMemo(() => {
    if (targetScope === "all" || tenantIds.length === 0) {
      return [{ target_role: targetRole, tenant_apotek_id: null }];
    }
    return tenantIds.map((tenantId) => ({ target_role: targetRole, tenant_apotek_id: tenantId }));
  }, [targetRole, targetScope, tenantIds]);

  return (
    <form action={action} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <input type="hidden" name="id" value={editing?.id ?? ""} />
      <input type="hidden" name="targets" value={JSON.stringify(targetPayload)} />
      <h2 className="text-lg font-black text-slate-800">Composer Pengumuman</h2>

      {state?.error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p> : null}
      {state?.success ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{state.message}</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {templates.map((tpl) => (
          <button
            key={tpl.label}
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
            onClick={() => {
              setTitle(tpl.title);
              setBody(tpl.body);
              setPriority(tpl.priority);
            }}
          >
            Template: {tpl.label}
          </button>
        ))}
      </div>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Judul</span>
        <input
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2"
          placeholder="Contoh: Perubahan jam cut-off verifikasi"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-700">Isi Pengumuman</span>
        <textarea
          name="body"
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="rounded-xl border border-slate-300 px-3 py-2"
          placeholder="Tulis detail pengumuman operasional."
        />
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-700">Prioritas</span>
          <select
            name="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as AnnouncementPriority)}
            className="rounded-xl border border-slate-300 px-3 py-2"
          >
            {Object.entries(ANNOUNCEMENT_PRIORITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-700">Role Target</span>
          <select
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value as AnnouncementTargetRole)}
            className="rounded-xl border border-slate-300 px-3 py-2"
          >
            <option value="admin_apotek">Admin Apotek</option>
            <option value="crew">Crew</option>
          </select>
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-700">Cakupan Cabang</span>
          <select
            value={targetScope}
            onChange={(e) => setTargetScope(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2"
          >
            <option value="all">Semua cabang</option>
            <option value="tenant">Cabang tertentu</option>
          </select>
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-700">Waktu Publish</span>
          <input
            type="datetime-local"
            name="publishAt"
            defaultValue={editing?.publish_at ? editing.publish_at.slice(0, 16) : ""}
            className="rounded-xl border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      {targetScope === "tenant" ? (
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-700">Pilih Cabang</span>
          <select
            multiple
            value={tenantIds}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions).map((item) => item.value);
              setTenantIds(selected);
            }}
            className="min-h-36 rounded-xl border border-slate-300 px-3 py-2"
          >
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name} ({tenant.code})
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="grid gap-1 text-sm md:max-w-sm">
        <span className="font-medium text-slate-700">Kadaluarsa</span>
        <input
          type="datetime-local"
          name="expireAt"
          defaultValue={editing?.expire_at ? editing.expire_at.slice(0, 16) : ""}
          className="rounded-xl border border-slate-300 px-3 py-2"
        />
      </label>

      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
        <SubmitButton value="save_draft" label="Simpan Draft" />
        <SubmitButton value="schedule" label="Jadwalkan" className="bg-indigo-600 text-white" />
        <SubmitButton value="publish" label="Publikasikan" className="bg-emerald-600 text-white" />
        {editing ? <SubmitButton value="archive" label="Arsipkan" className="bg-slate-700 text-white" /> : null}
      </div>
    </form>
  );
}
