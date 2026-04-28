export type Role = "super_admin_bba" | "crew" | "admin_apotek" | "owner";

export type RequestStatus =
  | "draft"
  | "submitted"
  | "revision_required"
  | "approved"
  | "rejected";

export type CandidateStatus =
  | "new"
  | "screening_passed"
  | "screening_failed"
  | "interview_scheduled"
  | "interviewed"
  | "hired"
  | "rejected"
  | "hold";

export type TaskStatus =
  | "open"
  | "assigned"
  | "in_progress"
  | "submitted"
  | "revision_required"
  | "approved"
  | "closed";

export interface WorkforceRequest {
  id: string;
  tenant: string;
  positionTitle: string;
  headcountNeeded: number;
  priorityLevel: "low" | "medium" | "high";
  targetJoinDate: string;
  status: RequestStatus;
}

export interface Candidate {
  id: string;
  tenant: string;
  fullName: string;
  appliedPosition: string;
  sourceChannel: string;
  status: CandidateStatus;
}

export interface Task {
  id: string;
  tenant: string;
  title: string;
  assignee: string;
  dueDate: string;
  status: TaskStatus;
}
