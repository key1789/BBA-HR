import test from "node:test";
import assert from "node:assert/strict";
import { resolveAttendanceStatus, type AttendanceResolveInput } from "@/lib/attendance-status";

const base: AttendanceResolveInput = {
  isScheduled: true,
  isOff: false,
  hasClockIn: false,
  isLate: false,
  hasApprovedLeave: false,
  isPast: true,
};

test("tak dijadwalkan → none", () => {
  assert.equal(resolveAttendanceStatus({ ...base, isScheduled: false }), "none");
});

test("roster libur → off", () => {
  assert.equal(resolveAttendanceStatus({ ...base, isOff: true }), "off");
});

test("clock-in tepat waktu → hadir", () => {
  assert.equal(resolveAttendanceStatus({ ...base, hasClockIn: true }), "hadir");
});

test("clock-in terlambat → terlambat", () => {
  assert.equal(resolveAttendanceStatus({ ...base, hasClockIn: true, isLate: true }), "terlambat");
});

test("izin disetujui tanpa clock-in → izin", () => {
  assert.equal(resolveAttendanceStatus({ ...base, hasApprovedLeave: true }), "izin");
});

test("clock-in mengalahkan izin (crew nyatanya datang) → hadir", () => {
  assert.equal(resolveAttendanceStatus({ ...base, hasClockIn: true, hasApprovedLeave: true }), "hadir");
});

test("terjadwal kerja, LAMPAU, tanpa absen & izin → alpha", () => {
  assert.equal(resolveAttendanceStatus({ ...base, isPast: true }), "alpha");
});

test("terjadwal kerja, hari ini/mendatang, belum absen → belum (BUKAN alpha)", () => {
  assert.equal(resolveAttendanceStatus({ ...base, isPast: false }), "belum");
});

test("libur mengalahkan segalanya (hari OFF tak jadi alpha walau lampau)", () => {
  assert.equal(resolveAttendanceStatus({ ...base, isOff: true, isPast: true }), "off");
});
