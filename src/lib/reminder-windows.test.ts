import test from "node:test";
import assert from "node:assert/strict";
import { getOperationalReminderWindow } from "@/lib/reminder-windows";

test("reminder window should be normal before 16:00 WIB", () => {
  const date = new Date("2026-04-29T07:30:00.000Z"); // 14:30 WIB
  const result = getOperationalReminderWindow(date);
  assert.equal(result.phase, "normal");
  assert.equal(result.timezoneLabel, "WIB");
});

test("reminder window should be near_cutoff from 16:00 WIB", () => {
  const date = new Date("2026-04-29T09:00:00.000Z"); // 16:00 WIB
  const result = getOperationalReminderWindow(date);
  assert.equal(result.phase, "near_cutoff");
});

test("reminder window should be post_cutoff from 19:00 WIB", () => {
  const date = new Date("2026-04-29T12:00:00.000Z"); // 19:00 WIB
  const result = getOperationalReminderWindow(date);
  assert.equal(result.phase, "post_cutoff");
});
