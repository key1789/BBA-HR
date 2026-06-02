const SUBMISSION_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  reject: "Rejected",
  edited_by_admin: "Edited by Admin",
  missing_submission: "Missing Submission",
};

const VERIFICATION_ACTION_LABEL: Record<string, string> = {
  approve: "Approve",
  reject: "Reject",
  edit_directly: "Edit Directly",
};

const EXPORT_JOB_STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  processing: "Processing",
  done: "Done",
  failed: "Failed",
};

const PAYROLL_STATUS_LABEL: Record<string, string> = {
  draft_bba: "Draft BBA",
  reviewed_ba: "Reviewed BA",
  pending_audit: "Pending Audit",
  pending_owner_approval: "Pending Owner Approval",
  approved_owner: "Approved Owner",
  paid: "Paid",
  archived: "Archived",
  unlocked_by_bba_admin: "Unlocked by BBA Admin",
  locked: "Locked",
};

const ROLE_LABEL: Record<string, string> = {
  crew: "Crew",
  admin_apotek: "Admin Apotek",
  owner: "Owner",
  super_admin_bba: "Super Admin BBA",
};

const AUDIT_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  under_review: "Under Review",
  approved: "Approved",
};

// Label untuk filter status di halaman verifikasi (berbeda dari display status submission)
const SUBMISSION_FILTER_STATUS_LABEL: Record<string, string> = {
  all:             "Semua",
  submitted:       "Menunggu",
  edited_by_admin: "Diedit Admin",
  reject:          "Ditolak",
  approved:        "Disetujui",
};

export function humanizeEnum(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function getSubmissionStatusLabel(status: string) {
  return SUBMISSION_STATUS_LABEL[status] ?? humanizeEnum(status);
}

export function getSubmissionStatusBadgeClass(status: string) {
  if (status === "approved") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "submitted" || status === "edited_by_admin") {
    return "bg-amber-50 text-amber-700";
  }
  if (status === "reject") {
    return "bg-rose-50 text-rose-700";
  }
  return "bg-slate-100 text-slate-700";
}

export function getVerificationActionLabel(action: string) {
  return VERIFICATION_ACTION_LABEL[action] ?? humanizeEnum(action);
}

export function getExportJobStatusLabel(status: string) {
  return EXPORT_JOB_STATUS_LABEL[status] ?? humanizeEnum(status);
}

export function getExportJobStatusBadgeClass(status: string) {
  if (status === "done") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "processing" || status === "queued") {
    return "bg-amber-50 text-amber-700";
  }
  if (status === "failed") {
    return "bg-rose-50 text-rose-700";
  }
  return "bg-slate-100 text-slate-700";
}

export function getPayrollStatusLabel(status: string) {
  return PAYROLL_STATUS_LABEL[status] ?? humanizeEnum(status);
}

export function getPayrollStatusBadgeClass(status: string) {
  if (status === "paid" || status === "approved_owner") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (
    status === "pending_audit" ||
    status === "pending_owner_approval" ||
    status === "reviewed_ba"
  ) {
    return "bg-amber-50 text-amber-700";
  }
  if (status === "unlocked_by_bba_admin") {
    return "bg-rose-50 text-rose-700";
  }
  if (status === "locked") {
    return "bg-slate-200 text-slate-800";
  }
  return "bg-slate-100 text-slate-700";
}

export function getRoleLabel(role: string) {
  return ROLE_LABEL[role] ?? humanizeEnum(role);
}

export function getAuditStatusLabel(status: string) {
  return AUDIT_STATUS_LABEL[status.toLowerCase()] ?? humanizeEnum(status);
}

export function getAuditStatusBadgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "approved") return "bg-emerald-100 text-emerald-700";
  if (s === "under_review") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export function getSubmissionFilterStatusLabel(status: string) {
  return SUBMISSION_FILTER_STATUS_LABEL[status] ?? humanizeEnum(status);
}
