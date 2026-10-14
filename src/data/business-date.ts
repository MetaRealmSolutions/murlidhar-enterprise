/**
 * The business timezone is India: Asia/Kolkata = UTC+5:30, with no daylight saving. Every business date (the yyyy-mm-dd of
 * transactions/{date}, salesmen/{id}/dailyBills/{date}, a bill's date, "today"), every wall-clock time shown and every day
 * boundary comes from here. Nothing reads the browser's own timezone, so the same instant is the same business day on every device.
 *
 * Instants are stored as ISO strings or Firestore server timestamps; business dates are separate yyyy-mm-dd fields.
 */
const IST_OFFSET_MS = 330 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

/** The India wall clock of an instant, read with UTC getters on the shifted time. */
export function istClock(at: Date | string = new Date()) {
  const d = new Date(new Date(at).getTime() + IST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

/** The business date (yyyy-mm-dd, Asia/Kolkata) of an instant. */
export function businessDate(at: Date | string = new Date()): string {
  const c = istClock(at);
  return `${c.year}-${pad(c.month)}-${pad(c.day)}`;
}

/** Hour of the day (0-23) in India: for "Good morning". */
export const istHour = (at: Date | string = new Date()) => istClock(at).hour;

/** "5:20 PM", India time. */
export function istTime(at: Date | string): string {
  const c = istClock(at);
  return `${c.hour % 12 || 12}:${pad(c.minute)} ${c.hour < 12 ? 'AM' : 'PM'}`;
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "05 Oct 2026, 5:20 PM", India time. */
export function istStamp(at: Date | string): string {
  const c = istClock(at);
  return `${pad(c.day)} ${MONTH_NAMES[c.month - 1].slice(0, 3)} ${c.year}, ${istTime(at)}`;
}

/** "05 October 2026, 5:20 PM", India time (the "Generated on" line). */
export function istLongStamp(at: Date | string = new Date()): string {
  const c = istClock(at);
  return `${pad(c.day)} ${MONTH_NAMES[c.month - 1]} ${c.year}, ${istTime(at)}`;
}
