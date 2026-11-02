import { differenceInCalendarDays, startOfDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export const APP_TZ = "Asia/Kolkata";

export function nowIst(date = new Date()): Date {
  return toZonedTime(date, APP_TZ);
}

export function startOfDayIst(date = new Date()): Date {
  return startOfDay(nowIst(date));
}

/** Calendar days overdue; 0 if not overdue. */
export function daysOverdue(dueDate: Date, asOf: Date = new Date()): number {
  const due = startOfDay(toZonedTime(dueDate, APP_TZ));
  const today = startOfDay(toZonedTime(asOf, APP_TZ));
  const diff = differenceInCalendarDays(today, due);
  return diff > 0 ? diff : 0;
}

export function daysUntil(dueDate: Date, asOf: Date = new Date()): number {
  const due = startOfDay(toZonedTime(dueDate, APP_TZ));
  const today = startOfDay(toZonedTime(asOf, APP_TZ));
  return differenceInCalendarDays(due, today);
}

export function calendarDaysBetween(start: Date, end: Date): number {
  const s = startOfDay(toZonedTime(start, APP_TZ));
  const e = startOfDay(toZonedTime(end, APP_TZ));
  return Math.max(0, differenceInCalendarDays(e, s));
}

export function atHourIst(date: Date, hour: number): Date {
  const zoned = toZonedTime(date, APP_TZ);
  zoned.setHours(hour, 0, 0, 0);
  return fromZonedTime(zoned, APP_TZ);
}
