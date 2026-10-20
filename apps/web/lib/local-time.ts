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
