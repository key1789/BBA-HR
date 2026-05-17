const WIB_TIMEZONE = "Asia/Jakarta";
const REMINDER_CUTOFF_HOUR = 19;
const NEAR_CUTOFF_START_HOUR = 16;

export type ReminderPhase = "normal" | "near_cutoff" | "post_cutoff";

type WibClock = {
  dateKey: string;
  hour: number;
  minute: number;
};

function getWibClock(date = new Date()): WibClock {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: WIB_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = read("year");
  const month = read("month");
  const day = read("day");
  const hour = Number(read("hour") || "0");
  const minute = Number(read("minute") || "0");

  return {
    dateKey: `${year}-${month}-${day}`,
    hour,
    minute,
  };
}

export function getOperationalReminderWindow(date = new Date()) {
  const clock = getWibClock(date);
  const nowInMinutes = clock.hour * 60 + clock.minute;
  const nearCutoffMinutes = NEAR_CUTOFF_START_HOUR * 60;
  const cutoffMinutes = REMINDER_CUTOFF_HOUR * 60;

  let phase: ReminderPhase = "normal";
  if (nowInMinutes >= cutoffMinutes) {
    phase = "post_cutoff";
  } else if (nowInMinutes >= nearCutoffMinutes) {
    phase = "near_cutoff";
  }

  return {
    ...clock,
    phase,
    cutoffHour: REMINDER_CUTOFF_HOUR,
    timezoneLabel: "WIB",
  };
}
