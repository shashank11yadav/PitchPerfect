/**
 * Dates and times in the viewer's own time zone. The api stores and sends UTC; these run in the
 * browser, so each formatter is made per call and follows the zone the viewer is in now.
 */

const LOCALE = "en-US";

/**
 * "Tuesday, November 3, 2026 at 10:30 AM EST". Spelled out field by field: `dateStyle` and
 * `timeStyle` can't be combined with `timeZoneName`, and the long time style adds seconds.
 */
export function formatInterviewTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

/** "Oct 14, 2026" in the viewer's zone. */
export function formatLocalDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

const dayKey = (date: Date) => new Intl.DateTimeFormat(LOCALE).format(date);

/**
 * When the daily practice count starts over (UTC midnight), as the viewer would say it:
 * "today at 8:00 PM EDT" in New York, "tomorrow at 2:00 AM GMT+2" in Berlin.
 */
export function formatResetTime(iso: string, now: Date = new Date()): string {
  const reset = new Date(iso);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  let day: string;
  if (dayKey(reset) === dayKey(now)) day = "today";
  else if (dayKey(reset) === dayKey(tomorrow)) day = "tomorrow";
  else day = `on ${new Intl.DateTimeFormat(LOCALE, { weekday: "long" }).format(reset)}`;
  const time = new Intl.DateTimeFormat(LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(reset);
  return `${day} at ${time}`;
}

/**
 * When the monthly practice count starts over (the 1st of next month, UTC midnight), in the
 * viewer's zone: "Saturday, October 31 at 8:00 PM EDT" in New York.
 */
export function formatMonthlyReset(now: Date = new Date()): string {
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(reset);
}

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const pad = (value: number) => String(value).padStart(2, "0");

/** The parts of a `datetime-local` value, and the Date they make in the viewer's zone. */
function readLocalInput(value: string) {
  const match = LOCAL_INPUT.exec(value);
  if (!match) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(year, month - 1, day, hour, minute);
  // Date rolls "February 30" over into March; a real date keeps its own day.
  if (date.getMonth() !== month - 1 || date.getDate() !== day || hour > 23) return null;
  return { date, hour, minute };
}

/**
 * True for a real date whose wall-clock time doesn't exist in the viewer's zone, because the
 * clocks jump over it (2:30 AM on the day daylight saving starts in New York).
 */
export function isSkippedLocalTime(value: string): boolean {
  const read = readLocalInput(value);
  return (
    read !== null && (read.date.getHours() !== read.hour || read.date.getMinutes() !== read.minute)
  );
}

/**
 * A `datetime-local` value ("2026-11-02T15:00") read as wall-clock time in the viewer's zone, as
 * a UTC ISO string for the api; null when it isn't a real date and time there.
 */
export function localInputToIso(value: string): string | null {
  const read = readLocalInput(value);
  if (!read || isSkippedLocalTime(value)) return null;
  return read.date.toISOString();
}

/** The other way: a UTC time as the viewer's `datetime-local` value, to fill the input. */
export function isoToLocalInput(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The viewer's IANA zone name, e.g. "America/New_York". */
export const viewerTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
