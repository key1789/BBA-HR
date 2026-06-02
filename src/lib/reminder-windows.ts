const WIB_TIMEZONE = "Asia/Jakarta";

/** Phase selalu "normal" — periode cut-off sudah tidak digunakan. */
export type ReminderPhase = "normal";

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

  const year   = read("year");
  const month  = read("month");
  const day    = read("day");
  const hour   = Number(read("hour")   || "0");
  const minute = Number(read("minute") || "0");

  return {
    dateKey: `${year}-${month}-${day}`,
    hour,
    minute,
  };
}

export function getOperationalReminderWindow(date = new Date()) {
  const clock = getWibClock(date);
  return {
    ...clock,
    phase: "normal" as ReminderPhase,
    timezoneLabel: "WIB",
  };
}
