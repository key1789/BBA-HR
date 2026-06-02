"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useActionState, useState, useRef, useCallback, startTransition } from "react";
import { createBranchOnboardingAction } from "./actions";
import type { OnboardingResult } from "./actions";
import {
  Store,
  User,
  Users,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  Loader2,
  Copy,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  MapPin,
  Phone,
  Mail,
  Clock,
  ChevronDown,
} from "lucide-react";
import Link from "next/link";
import { getAppUrl } from "@/lib/app-url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Owner = { id: string; full_name: string };

type BranchInfo = {
  name: string;
  code: string;
  address: string;
  phone: string;
  ownerId: string;
};

type AdminInfo = {
  email: string;
};

type StaffRow = {
  _key: string;
  fullName: string;
  email: string;
  phone: string;
  emailTouched: boolean;
};

type ShiftRow = {
  _key: string;
  shift_name: string;
  start_time: string;
  end_time: string;
};

// ---------------------------------------------------------------------------
// Email & code generation helpers
// ---------------------------------------------------------------------------

/** Ambil inisial setiap kata, maks 4 huruf, + counter "-01". */
function generateBranchCode(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return initials ? `${initials}-01` : "";
}

/** Normalisasi string jadi safe untuk local-part email: huruf kecil, alfanumerik + strip sisanya. */
function normalizeForEmail(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Saran email admin: admin.{kode}@bba.id */
function suggestAdminEmail(branchCode: string): string {
  const code = normalizeForEmail(branchCode);
  return code ? `admin.${code}@bba.id` : "";
}

/** Saran email crew: {namadepan}.{kode}@bba.id */
function suggestCrewEmail(fullName: string, branchCode: string): string {
  const firstName = fullName.trim().split(/\s+/)[0] ?? "";
  const name = normalizeForEmail(firstName);
  const code = normalizeForEmail(branchCode);
  return name && code ? `${name}.${code}@bba.id` : "";
}

const DEFAULT_SHIFTS: ShiftRow[] = [
  { _key: "s1", shift_name: "PAGI", start_time: "07:00", end_time: "15:00" },
  { _key: "s2", shift_name: "SIANG", start_time: "15:00", end_time: "21:00" },
];

type WizardStep = 1 | 2 | 3 | 4;

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS = [
  { n: 1, label: "Info Apotek" },
  { n: 2, label: "Admin Apotek" },
  { n: 3, label: "Daftar Staf" },
  { n: 4, label: "Ringkasan" },
];

function StepIndicator({ current }: { current: WizardStep }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, idx) => (
        <div key={step.n} className="flex items-center">
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                current === step.n
                  ? "bg-sky-600 text-white shadow-md shadow-sky-600/30"
                  : current > step.n
                    ? "bg-emerald-500 text-white"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              {current > step.n ? <CheckCircle2 size={14} /> : step.n}
            </div>
            <span
              className={`text-[9px] font-black uppercase tracking-wider whitespace-nowrap ${
                current === step.n ? "text-sky-600" : current > step.n ? "text-emerald-600" : "text-slate-400"
              }`}
            >
              {step.label}
            </span>
          </div>
          {idx < STEPS.length - 1 && (
            <div className={`w-10 h-0.5 mb-4 mx-1 ${current > step.n ? "bg-emerald-400" : "bg-slate-200"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

function Field({
  label,
  required,
  icon,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-black text-slate-500 uppercase tracking-wider">
        {icon}
        {label}
        {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-sky-400 focus:outline-none transition-colors text-sm font-medium";

// ---------------------------------------------------------------------------
// Step 1 — Info Dasar
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Shift editor (used inside Step 1)
// ---------------------------------------------------------------------------

function ShiftEditor({ shifts, onChange }: { shifts: ShiftRow[]; onChange: (s: ShiftRow[]) => void }) {
  const [open, setOpen] = useState(false);

  const update = (key: string, field: keyof Omit<ShiftRow, "_key">, value: string) =>
    onChange(shifts.map((s) => (s._key === key ? { ...s, [field]: value } : s)));

  const add = () =>
    onChange([...shifts, { _key: crypto.randomUUID(), shift_name: "", start_time: "08:00", end_time: "16:00" }]);

  const remove = (key: string) =>
    onChange(shifts.length > 1 ? shifts.filter((s) => s._key !== key) : shifts);

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-slate-500" />
          <span className="text-sm font-bold text-slate-700">Pengaturan Shift</span>
          <span className="text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full font-bold">
            {shifts.length} shift
          </span>
          {!open && (
            <span className="text-xs text-slate-400">
              ({shifts.map((s) => s.shift_name || "—").join(", ")})
            </span>
          )}
        </div>
        <ChevronDown
          size={15}
          className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="p-4 space-y-3 bg-white border-t border-slate-100">
          <p className="text-xs text-slate-400">
            Shift ini akan langsung tersedia saat apotek dibuat. Bisa diubah lagi kapan saja dari tab Shift di detail apotek.
          </p>
          {shifts.map((s, idx) => (
            <div key={s._key} className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-400 w-4 shrink-0">{idx + 1}</span>
              <input
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold uppercase focus:outline-none focus:border-sky-400 focus:bg-white transition-colors"
                placeholder="NAMA SHIFT"
                value={s.shift_name}
                maxLength={20}
                onChange={(e) => update(s._key, "shift_name", e.target.value.toUpperCase())}
              />
              <input
                type="time"
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-sky-400 focus:bg-white transition-colors"
                value={s.start_time}
                onChange={(e) => update(s._key, "start_time", e.target.value)}
              />
              <span className="text-xs text-slate-400 shrink-0">–</span>
              <input
                type="time"
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-sky-400 focus:bg-white transition-colors"
                value={s.end_time}
                onChange={(e) => update(s._key, "end_time", e.target.value)}
              />
              <button
                type="button"
                onClick={() => remove(s._key)}
                disabled={shifts.length <= 1}
                className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={add}
            className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-slate-200 rounded-xl text-xs font-bold text-slate-400 hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50 transition-all"
          >
            <Plus size={13} /> Tambah Shift
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Info Dasar
// ---------------------------------------------------------------------------

function Step1({
  data,
  shifts,
  owners,
  onNext,
  preselectedOwnerId,
}: {
  data: BranchInfo;
  shifts: ShiftRow[];
  owners: Owner[];
  onNext: (d: BranchInfo, s: ShiftRow[]) => void;
  preselectedOwnerId?: string;
}) {
  const [form, setForm] = useState(data);
  const isOwnerLocked = Boolean(preselectedOwnerId);
  const [localShifts, setLocalShifts] = useState<ShiftRow[]>(shifts);
  // Track apakah kode sudah diedit manual — jika belum, update otomatis dari nama
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(!!data.code);

  const set = (k: keyof BranchInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setForm((f) => ({
      ...f,
      name,
      code: codeManuallyEdited ? f.code : generateBranchCode(name),
    }));
  };

  const handleNext = () => {
    if (!form.name.trim() || !form.code.trim() || !form.ownerId) return;
    onNext(form, localShifts);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-4 bg-sky-50 border border-sky-100 rounded-2xl">
        <Store className="text-sky-600 shrink-0" size={20} />
        <div>
          <p className="text-sm font-bold text-sky-900">Data Apotek</p>
          <p className="text-xs text-sky-700/80 mt-0.5">Add-on dan KPI bulan berjalan akan dibuat otomatis.</p>
        </div>
      </div>

      <Field label="Nama Apotek" required>
        <input className={inputCls} value={form.name} onChange={handleNameChange} placeholder="Apotek Sehat Medika" />
      </Field>

      <Field label="Kode Cabang" required hint="Maks. 10 karakter, digunakan sebagai identifikasi internal.">
        <div className="flex items-center gap-2">
          <input
            className={`${inputCls} uppercase font-bold flex-1`}
            value={form.code}
            onChange={(e) => {
              setCodeManuallyEdited(true);
              setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }));
            }}
            placeholder="ASM-01"
            maxLength={10}
          />
          {!codeManuallyEdited && form.code && (
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-1.5 rounded-lg shrink-0">
              Otomatis
            </span>
          )}
        </div>
      </Field>

      <Field label="Alamat" icon={<MapPin size={11} className="text-slate-400" />}>
        <textarea
          className={`${inputCls} resize-none`}
          rows={2}
          value={form.address}
          onChange={set("address")}
          placeholder="Alamat lengkap apotek — bisa dilengkapi nanti"
        />
      </Field>

      <Field label="Telepon / WA Cabang" icon={<Phone size={11} className="text-slate-400" />}>
        <input className={inputCls} value={form.phone} onChange={set("phone")} placeholder="0812xxxxxxxx" />
      </Field>

      <Field label="Assign ke Owner" required>
        {isOwnerLocked ? (
          <div className="flex items-center gap-2">
            <input
              className={`${inputCls} bg-sky-50 border-sky-200 text-sky-800 font-bold cursor-not-allowed flex-1`}
              value={owners.find((o) => o.id === form.ownerId)?.full_name ?? form.ownerId}
              readOnly
            />
            <span className="text-[10px] font-black uppercase text-sky-600 bg-sky-50 border border-sky-200 rounded-lg px-2 py-2 shrink-0 whitespace-nowrap">
              Terpilih
            </span>
          </div>
        ) : (
          <select className={inputCls} value={form.ownerId} onChange={set("ownerId")}>
            <option value="">-- Pilih Owner Apotek --</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <ShiftEditor shifts={localShifts} onChange={setLocalShifts} />

      <div className="pt-4 border-t border-slate-100 flex justify-end">
        <button
          onClick={handleNext}
          disabled={!form.name.trim() || !form.code.trim() || !form.ownerId}
          className="flex items-center gap-2 px-6 py-2.5 bg-sky-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-sky-600/20 hover:bg-sky-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Lanjut <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Admin Apotek
// ---------------------------------------------------------------------------

function Step2({
  data,
  branchCode,
  onNext,
  onBack,
}: {
  data: AdminInfo;
  branchCode: string;
  onNext: (d: AdminInfo) => void;
  onBack: () => void;
}) {
  const suggested = suggestAdminEmail(branchCode);
  const [email, setEmail] = useState(data.email || suggested);
  const isAuto = email === suggested;

  const canNext = email.trim().length > 0 && email.includes("@");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
        <User className="text-amber-600 shrink-0" size={20} />
        <div>
          <p className="text-sm font-bold text-amber-900">Akun Admin Apotek (Shared)</p>
          <p className="text-xs text-amber-700/80 mt-0.5">
            Satu akun bersama — siapapun yang bertugas sebagai admin login dengan akun ini. Admin perlu mengaktifkan akun via link aktivasi untuk membuat password.
          </p>
        </div>
      </div>

      <Field
        label="Email Admin"
        required
        icon={<Mail size={11} className="text-slate-400" />}
        hint="Email ini sebagai login. Bisa diganti ke email personal — pastikan belum terdaftar di sistem."
      >
        <div className="flex items-center gap-2">
          <input
            type="email"
            className={`${inputCls} flex-1`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin.asm01@bba.id"
          />
          {isAuto && (
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-1.5 rounded-lg shrink-0">
              Saran
            </span>
          )}
        </div>
      </Field>

      <div className="flex items-start gap-2.5 p-3 bg-sky-50 border border-sky-100 rounded-xl">
        <AlertCircle size={14} className="text-sky-500 shrink-0 mt-0.5" />
        <p className="text-xs text-sky-700 leading-relaxed">
          Setelah apotek didaftarkan, <strong>link aktivasi</strong> akan tampil di halaman hasil untuk disalin dan dikirim ke admin. Admin buka link → buat password → langsung bisa login. Link berlaku <strong>7 hari</strong>.
        </p>
      </div>

      <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2.5 text-slate-600 bg-slate-100 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
        >
          <ChevronLeft size={16} /> Kembali
        </button>
        <button
          onClick={() => canNext && onNext({ email })}
          disabled={!canNext}
          className="flex items-center gap-2 px-6 py-2.5 bg-sky-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-sky-600/20 hover:bg-sky-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Lanjut <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Daftar Staf
// ---------------------------------------------------------------------------

function Step3({
  data,
  branchCode,
  onNext,
  onBack,
}: {
  data: StaffRow[];
  branchCode: string;
  onNext: (d: StaffRow[]) => void;
  onBack: () => void;
}) {
  const emptyRow = (): StaffRow => ({ _key: crypto.randomUUID(), fullName: "", email: "", phone: "", emailTouched: false });
  const [rows, setRows] = useState<StaffRow[]>(data.length > 0 ? data : [emptyRow()]);

  const updateRow = (key: string, field: keyof Omit<StaffRow, "_key" | "emailTouched">, value: string) =>
    setRows((rs) => rs.map((r) => {
      if (r._key !== key) return r;
      // Ketika nama berubah dan email belum diedit manual → auto-suggest
      if (field === "fullName" && !r.emailTouched) {
        return { ...r, fullName: value, email: suggestCrewEmail(value, branchCode) };
      }
      return { ...r, [field]: value };
    }));

  const updateEmail = (key: string, value: string) =>
    setRows((rs) => rs.map((r) => r._key === key ? { ...r, email: value, emailTouched: true } : r));

  const addRow = () =>
    setRows((rs) => [...rs, emptyRow()]);

  const removeRow = (key: string) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r._key !== key) : rs));

  const handleNext = () => {
    const filled = rows.filter((r) => r.fullName.trim() && r.email.trim());
    onNext(filled);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
        <Users className="text-indigo-600 shrink-0" size={20} />
        <div>
          <p className="text-sm font-bold text-indigo-900">Daftar Staf / Crew</p>
          <p className="text-xs text-indigo-700/80 mt-0.5">
            Isi data staf yang akan diundang. Baris yang emailnya kosong akan diabaikan. Staf baru bisa ditambahkan kapan saja dari halaman detail apotek.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((row, idx) => (
          <div key={row._key} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-400 uppercase tracking-wider">Staf #{idx + 1}</span>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(row._key)}
                  className="text-rose-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                className={inputCls}
                placeholder="Nama Lengkap *"
                value={row.fullName}
                onChange={(e) => updateRow(row._key, "fullName", e.target.value)}
              />
              <div className="relative">
                <input
                  type="email"
                  className={inputCls}
                  placeholder="Email *"
                  value={row.email}
                  onChange={(e) => updateEmail(row._key, e.target.value)}
                />
                {!row.emailTouched && row.email && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded pointer-events-none">
                    Saran
                  </span>
                )}
              </div>
            </div>
            <input
              className={inputCls}
              placeholder="No HP (opsional)"
              value={row.phone}
              onChange={(e) => updateRow(row._key, "phone", e.target.value)}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-300 rounded-2xl text-sm font-bold text-slate-500 hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50 transition-all"
      >
        <Plus size={16} /> Tambah Staf
      </button>

      <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2.5 text-slate-600 bg-slate-100 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
        >
          <ChevronLeft size={16} /> Kembali
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNext([])}
            className="px-4 py-2.5 text-slate-500 font-semibold text-sm hover:text-slate-800 transition-colors"
          >
            Lewati
          </button>
          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-6 py-2.5 bg-sky-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-sky-600/20 hover:bg-sky-700 transition-all active:scale-95"
          >
            Lanjut <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Review & Submit
// ---------------------------------------------------------------------------

function Step4({
  branch,
  shifts,
  admin,
  staff,
  onBack,
  onSubmit,
  isPending,
}: {
  branch: BranchInfo;
  shifts: ShiftRow[];
  admin: AdminInfo;
  staff: StaffRow[];
  onBack: () => void;
  onSubmit: () => void;
  isPending: boolean;
}) {

  return (
    <div className="space-y-5">
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider">Info Apotek</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-slate-500">Nama</span>
          <span className="font-bold text-slate-800">{branch.name}</span>
          <span className="text-slate-500">Kode</span>
          <span className="font-bold text-slate-800 uppercase">{branch.code}</span>
          {branch.address && (
            <>
              <span className="text-slate-500">Alamat</span>
              <span className="font-medium text-slate-700">{branch.address}</span>
            </>
          )}
          {branch.phone && (
            <>
              <span className="text-slate-500">Telepon</span>
              <span className="font-medium text-slate-700">{branch.phone}</span>
            </>
          )}
        </div>
      </div>

      <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
        <p className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <Clock size={11} /> Shift ({shifts.filter((s) => s.shift_name.trim()).length})
        </p>
        <div className="flex flex-wrap gap-2">
          {shifts.filter((s) => s.shift_name.trim()).map((s) => (
            <span key={s._key} className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-1.5 font-bold text-slate-700">
              {s.shift_name} · {s.start_time}–{s.end_time}
            </span>
          ))}
        </div>
      </div>

      <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl space-y-2">
        <p className="text-xs font-black text-amber-600 uppercase tracking-wider">Akun Admin Apotek</p>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <span className="text-slate-500">Email</span>
          <span className="font-bold text-slate-800">{admin.email || "—"}</span>
          <span className="text-slate-500">Aktivasi</span>
          <span className="text-xs text-amber-700 font-semibold">Link aktivasi · berlaku 7 hari</span>
        </div>
      </div>

      <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-2">
        <p className="text-xs font-black text-indigo-600 uppercase tracking-wider">Daftar Staf ({staff.length} orang)</p>
        {staff.length === 0 ? (
          <p className="text-sm text-slate-500 italic">Tidak ada staf — tambahkan nanti dari halaman detail apotek.</p>
        ) : (
          <ul className="space-y-1">
            {staff.map((s) => (
              <li key={s._key} className="flex items-center gap-2 text-sm">
                <User size={12} className="text-indigo-400 shrink-0" />
                <span className="font-semibold text-slate-800">{s.fullName}</span>
                <span className="text-slate-400 text-xs">· {s.email}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
        <button
          onClick={onBack}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2.5 text-slate-600 bg-slate-100 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors disabled:opacity-50"
        >
          <ChevronLeft size={16} /> Kembali
        </button>
        <button
          onClick={onSubmit}
          disabled={isPending}
          className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Memproses...
            </>
          ) : (
            <>
              <CheckCircle2 size={16} /> Daftarkan Apotek
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Result (Ringkasan & Salin Link)
// ---------------------------------------------------------------------------

function ResultView({ result }: { result: Extract<OnboardingResult, { success: true }> }) {
  const [copied, setCopied] = useState(false);
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  const loginUrl = `${appUrl}/login`;

  const buildText = () => {
    const lines: string[] = [];
    lines.push("============================");
    lines.push(`ONBOARDING APOTEK ${result.branchName.toUpperCase()}`);
    lines.push(`Kode: ${result.branchCode} | ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`);
    lines.push("============================");
    lines.push("");

    const adminResult = result.staffResults.find((r) => r.role === "admin_apotek");
    if (adminResult) {
      lines.push("[AKUN ADMIN APOTEK]");
      lines.push(`Nama  : ${adminResult.fullName}`);
      lines.push(`Email : ${adminResult.email}`);
      if (adminResult.skipped) {
        lines.push(`Catatan: ${adminResult.skipReason || "Gagal membuat undangan"}`);
      } else if (adminResult.inviteLink) {
        lines.push(`Link Aktivasi : ${adminResult.inviteLink}`);
        lines.push(`                (berlaku 7 hari, 1x pakai)`);
        lines.push(`Cara          : Buka link → buat password → langsung bisa login`);
      } else {
        lines.push(`Catatan: ${adminResult.skipReason || "Gagal"}`);
      }
      lines.push("");
    }

    const crewResults = result.staffResults.filter((r) => r.role === "crew");
    if (crewResults.length > 0) {
      lines.push("[DAFTAR STAF]");
      lines.push("");
      crewResults.forEach((s, idx) => {
        lines.push(`${idx + 1}. ${s.fullName}`);
        lines.push(`   Email  : ${s.email}`);
        lines.push(`   Akses  : Portal Crew`);
        if (s.inviteLink) {
          lines.push(`   Link   : ${s.inviteLink}`);
        } else {
          lines.push(`   Catatan: ${s.skipReason || "Gagal membuat undangan"}`);
        }
        lines.push("");
      });
    }

    lines.push("[CARA AKTIVASI]");
    lines.push("Admin & Staf: Klik link masing-masing → buat password → login.");
    lines.push("Link admin berlaku 7 hari. Link staf berlaku 48 jam.");
    lines.push("Setiap link hanya bisa digunakan 1x.");
    lines.push("");
    lines.push("[LINK LOGIN]");
    lines.push(`Portal Crew & Admin: ${loginUrl}`);
    lines.push("============================");

    return lines.join("\n");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(buildText()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  const adminResult = result.staffResults.find((r) => r.role === "admin_apotek");
  const crewResults = result.staffResults.filter((r) => r.role === "crew");
  const successCount = result.staffResults.filter((r) => !r.skipped).length;
  const skippedCount = result.staffResults.filter((r) => r.skipped).length;

  return (
    <div className="space-y-5">
      {/* Success banner */}
      <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
        <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={20} />
        <div>
          <p className="text-sm font-bold text-emerald-900">
            Apotek <span className="text-emerald-700">{result.branchName}</span> berhasil didaftarkan!
          </p>
          <p className="text-xs text-emerald-700/80 mt-0.5">
            {successCount} undangan dibuat
            {skippedCount > 0 ? ` · ${skippedCount} dilewati (email sudah ada)` : ""}.
          </p>
        </div>
      </div>

      {/* Admin result */}
      {adminResult && (
        <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl space-y-2">
          <p className="text-xs font-black text-amber-600 uppercase tracking-wider">Akun Admin Apotek</p>
          <div className="text-sm space-y-1">
            <p className="font-semibold text-slate-800">{adminResult.fullName}</p>
            <p className="text-slate-500">{adminResult.email}</p>
            {adminResult.skipped ? (
              <p className="text-xs text-rose-600 flex items-center gap-1">
                <AlertCircle size={11} /> {adminResult.skipReason}
              </p>
            ) : adminResult.inviteLink ? (
              <div className="space-y-1 mt-1">
                <a
                  href={adminResult.inviteLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sky-600 font-medium hover:underline text-xs"
                >
                  <ExternalLink size={11} /> Link aktivasi admin
                </a>
                <p className="text-[10px] text-amber-600 font-semibold">Berlaku 7 hari · link 1x pakai</p>
              </div>
            ) : (
              <p className="text-xs text-rose-600 flex items-center gap-1">
                <AlertCircle size={11} /> {adminResult.skipReason}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Crew results */}
      {crewResults.length > 0 && (
        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-3">
          <p className="text-xs font-black text-indigo-600 uppercase tracking-wider">Staf / Crew</p>
          <ul className="space-y-3">
            {crewResults.map((s, idx) => (
              <li key={idx} className="text-sm space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">{s.fullName}</span>
                  {s.skipped && (
                    <span className="text-[10px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full font-bold">
                      SKIP
                    </span>
                  )}
                </div>
                <p className="text-slate-500 text-xs">{s.email}</p>
                {s.inviteLink ? (
                  <a
                    href={s.inviteLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sky-600 text-xs hover:underline"
                  >
                    <ExternalLink size={10} /> Link aktivasi
                  </a>
                ) : (
                  <p className="text-xs text-slate-400 italic">{s.skipReason}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Copy button */}
      <button
        onClick={handleCopy}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all active:scale-95 ${
          copied
            ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
            : "bg-slate-800 text-white hover:bg-slate-900 shadow-lg shadow-slate-800/20"
        }`}
      >
        {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
        {copied ? "Tersalin!" : "Salin Semua Informasi Onboarding"}
      </button>

      {/* Text preview */}
      <details className="rounded-2xl border border-slate-200 overflow-hidden">
        <summary className="px-4 py-3 text-xs font-bold text-slate-500 cursor-pointer hover:bg-slate-50 select-none">
          Lihat teks yang disalin
        </summary>
        <pre className="px-4 pb-4 pt-2 text-[10px] text-slate-600 whitespace-pre-wrap font-mono leading-relaxed bg-slate-50">
          {buildText()}
        </pre>
      </details>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Link
          href={`/bba/branches/${result.branchId}`}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-sky-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-sky-600/20 hover:bg-sky-700 transition-all active:scale-95"
        >
          <ExternalLink size={15} /> Buka Detail Apotek
        </Link>
        <Link
          href="/bba/branches"
          className="px-5 py-2.5 text-slate-600 bg-slate-100 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
        >
          Kembali ke Daftar
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard orchestrator
// ---------------------------------------------------------------------------

export function BranchOnboardingWizard({ owners, preselectedOwnerId }: { owners: Owner[]; preselectedOwnerId?: string }) {
  const [step, setStep] = useState<WizardStep>(1);
  const [branch, setBranch] = useState<BranchInfo>({ name: "", code: "", address: "", phone: "", ownerId: preselectedOwnerId ?? "" });
  const [shifts, setShifts] = useState<ShiftRow[]>(DEFAULT_SHIFTS);
  const [admin, setAdmin] = useState<AdminInfo>({ email: "" });
  const [staff, setStaff] = useState<StaffRow[]>([]);

  const formRef = useRef<HTMLFormElement>(null);

  const [result, submitAction, isPending] = useActionState<OnboardingResult | null, FormData>(
    createBranchOnboardingAction,
    null,
  );

  const handleSubmit = useCallback(() => {
    const fd = new FormData();
    fd.set("name", branch.name);
    fd.set("code", branch.code);
    fd.set("address", branch.address);
    fd.set("phone", branch.phone);
    fd.set("ownerId", branch.ownerId);

    fd.set("shiftsJson", JSON.stringify(
      shifts
        .filter((s) => s.shift_name.trim())
        .map(({ shift_name, start_time, end_time }) => ({ shift_name, start_time, end_time }))
    ));

    if (admin.email) {
      fd.set("adminEmail", admin.email);
    }

    fd.set("staffJson", JSON.stringify(staff.map(({ fullName, email, phone }) => ({ fullName, email, phone }))));

    startTransition(() => {
      submitAction(fd);
    });
  }, [branch, shifts, admin, staff, submitAction]);

  // If result is success, show result view
  if (result && "success" in result && result.success) {
    return (
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
        <ResultView result={result} />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
      {/* Step indicator */}
      <div className="flex justify-center">
        <StepIndicator current={step} />
      </div>

      <div className="border-t border-slate-100 pt-6">
        {/* Server error */}
        {result && "error" in result && (
          <div className="mb-5 flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 font-medium">
            <AlertCircle size={16} className="shrink-0" />
            {result.error}
          </div>
        )}

        {step === 1 && (
          <Step1
            data={branch}
            shifts={shifts}
            owners={owners}
            preselectedOwnerId={preselectedOwnerId}
            onNext={(d, s) => {
              setBranch(d);
              setShifts(s);
              setStep(2);
            }}
          />
        )}
        {step === 2 && (
          <Step2
            data={admin}
            branchCode={branch.code}
            onNext={(d) => {
              setAdmin(d);
              setStep(3);
            }}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <Step3
            data={staff}
            branchCode={branch.code}
            onNext={(d) => {
              setStaff(d);
              setStep(4);
            }}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && (
          <Step4
            branch={branch}
            shifts={shifts}
            admin={admin}
            staff={staff}
            onBack={() => setStep(3)}
            onSubmit={handleSubmit}
            isPending={isPending}
          />
        )}
      </div>

      {/* Hidden form anchor for useActionState */}
      <form ref={formRef} action={submitAction} className="hidden" />
    </div>
  );
}
