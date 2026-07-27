"use client";

import { useTransition, useState } from "react";
import { CalendarClock, UserCog, Crown } from "lucide-react";
import { updateScheduleAddonSettingsAction } from "@/app/sa/branches/[id]/actions";
import { toast } from "sonner";
import { DelegationAccessPanel } from "@/components/branch/DelegationAccessPanel";

interface Props {
  branchId: string;
  /** addon_settings.absensi_shift.settings.allow_admin_schedule */
  allowAdminSchedule: boolean;
  /** addon_settings.absensi_shift.settings.allow_owner_schedule */
  allowOwnerSchedule: boolean;
}

/**
 * Toggle SA: delegasi kelola JADWAL (roster + pola mingguan) ke Admin/Owner apotek.
 * Master Shift TIDAK termasuk (tetap SA-only). Memakai panel delegasi bersama.
 */
export function ScheduleAccessSection({ branchId, allowAdminSchedule, allowOwnerSchedule }: Props) {
  const [admin, setAdmin] = useState(allowAdminSchedule);
  const [owner, setOwner] = useState(allowOwnerSchedule);
  const [isPending, startTransition] = useTransition();

  function save(nextAdmin: boolean, nextOwner: boolean, revert: () => void) {
    const fd = new FormData();
    fd.set("tenantId", branchId);
    fd.set("allow_admin_schedule", String(nextAdmin));
    fd.set("allow_owner_schedule", String(nextOwner));
    startTransition(async () => {
      const res = await updateScheduleAddonSettingsAction(undefined, fd);
      if (res.success) {
        toast.success(res.message ?? "Pengaturan akses jadwal disimpan.");
      } else {
        toast.error(res.error ?? "Gagal menyimpan.");
        revert(); // kembalikan hanya toggle yang gagal ke nilai sebelumnya
      }
    });
  }

  return (
    <DelegationAccessPanel
      title="Delegasi Kelola Jadwal"
      Icon={CalendarClock}
      isSaving={isPending}
      description={
        <>
          Izinkan Admin / Owner mengatur <span className="font-black">roster &amp; pola mingguan</span> dari
          portal masing-masing. Master Shift tetap hanya dapat diubah oleh Anda (Super Admin).
        </>
      }
      roles={[
        {
          key: "admin",
          label: "Admin Apotek",
          Icon: UserCog,
          accent: "indigo",
          enabled: admin,
          descOn: "Dapat mengatur roster & pola",
          descOff: "Tidak dapat mengatur jadwal",
          accessNote: "Portal Admin → Jadwal & Absensi",
          onToggle: (next) => {
            setAdmin(next);
            save(next, owner, () => setAdmin(!next));
          },
        },
        {
          key: "owner",
          label: "Owner",
          Icon: Crown,
          accent: "amber",
          enabled: owner,
          descOn: "Dapat mengatur roster & pola",
          descOff: "Tidak dapat mengatur jadwal",
          accessNote: "Portal Owner → Jadwal",
          onToggle: (next) => {
            setOwner(next);
            save(admin, next, () => setOwner(!next));
          },
        },
      ]}
    />
  );
}
