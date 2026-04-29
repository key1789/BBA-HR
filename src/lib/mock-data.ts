import { Candidate, Role, Task, WorkforceRequest } from "@/lib/types";

export const roles: { value: Role; label: string }[] = [
  { value: "super_admin_bba", label: "Super Admin BBA" },
  { value: "crew", label: "Crew" },
  { value: "admin_apotek", label: "Admin Apotek" },
  { value: "owner", label: "Owner" },
];

export const workforceRequests: WorkforceRequest[] = [
  {
    id: "REQ-001",
    tenant: "Apotek Sehat Medika",
    positionTitle: "Apoteker Pendamping",
    headcountNeeded: 1,
    priorityLevel: "high",
    targetJoinDate: "2026-05-20",
    status: "submitted",
  },
  {
    id: "REQ-002",
    tenant: "Apotek Keluarga Farma",
    positionTitle: "Admin Gudang",
    headcountNeeded: 2,
    priorityLevel: "medium",
    targetJoinDate: "2026-05-30",
    status: "approved",
  },
];

export const candidates: Candidate[] = [
  {
    id: "CAN-001",
    tenant: "Apotek Sehat Medika",
    fullName: "Nadia Putri",
    appliedPosition: "Apoteker Pendamping",
    sourceChannel: "Instagram",
    status: "interview_scheduled",
  },
  {
    id: "CAN-002",
    tenant: "Apotek Keluarga Farma",
    fullName: "Rizky Maulana",
    appliedPosition: "Admin Gudang",
    sourceChannel: "Referral",
    status: "screening_passed",
  },
  {
    id: "CAN-003",
    tenant: "Apotek Sehat Medika",
    fullName: "Sinta Ayu",
    appliedPosition: "Apoteker Pendamping",
    sourceChannel: "Job Portal",
    status: "hired",
  },
];

export const tasks: Task[] = [
  {
    id: "TSK-001",
    tenant: "Apotek Sehat Medika",
    title: "Validasi CV Kandidat Apoteker",
    assignee: "Crew - Andi",
    dueDate: "2026-04-30",
    status: "submitted",
  },
  {
    id: "TSK-002",
    tenant: "Apotek Keluarga Farma",
    title: "Final Interview Admin Gudang",
    assignee: "Admin Apotek - Rina",
    dueDate: "2026-05-01",
    status: "in_progress",
  },
  {
    id: "TSK-003",
    tenant: "Apotek Sehat Medika",
    title: "Input Data Karyawan Baru",
    assignee: "Crew - Putra",
    dueDate: "2026-04-29",
    status: "approved",
  },
];
