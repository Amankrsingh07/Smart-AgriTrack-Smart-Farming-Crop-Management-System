/** Calendar date helpers for the farm's India-local irrigation schedule. */
export function indiaCalendarDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addCalendarDays(date: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(days)) {
    throw new RangeError(
      "Expected an ISO calendar date and a whole day count.",
    );
  }
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days, 12));
  const normalizedInput = new Date(Date.UTC(year, month - 1, day, 12))
    .toISOString()
    .slice(0, 10);
  if (normalizedInput !== date)
    throw new RangeError("Expected a valid ISO calendar date.");
  return value.toISOString().slice(0, 10);
}

/** Persist a date-only event at UTC noon so it displays as the same date everywhere. */
export function dateAtUtcNoon(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new RangeError("Expected an ISO calendar date.");
  return new Date(`${date}T12:00:00.000Z`);
}
