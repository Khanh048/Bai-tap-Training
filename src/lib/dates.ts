export const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";
const VIETNAM_OFFSET = "+07:00";
const DAY_IN_MS = 86_400_000;

export type CalendarView = "today" | "week" | "month";
export interface DateRange { from: string; to: string }

export function dateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: VIETNAM_TIME_ZONE,
  }).format(date);
}

export function vietnamDate(date: Date): Date {
  return new Date(`${dateKey(date)}T12:00:00${VIETNAM_OFFSET}`);
}

export function weekDays(anchor: Date): Date[] {
  const day = vietnamDate(anchor);
  const weekday = day.getUTCDay();
  const monday = new Date(day.getTime() - (weekday === 0 ? 6 : weekday - 1) * DAY_IN_MS);
  return Array.from({ length: 7 }, (_, index) => new Date(monday.getTime() + index * DAY_IN_MS));
}

export function monthGridDays(anchor: Date): Date[] {
  const [year, month] = dateKey(anchor).split("-").map(Number);
  const first = new Date(`${year}-${String(month).padStart(2, "0")}-01T12:00:00${VIETNAM_OFFSET}`);
  const last = new Date(`${year}-${String(month + 1).padStart(2, "0")}-01T12:00:00${VIETNAM_OFFSET}`);
  const lastOfMonth = Number.isNaN(last.getTime())
    ? new Date(`${year + 1}-01-01T12:00:00${VIETNAM_OFFSET}`)
    : last;
  const firstMonday = weekDays(first)[0];
  const finalDay = new Date(lastOfMonth.getTime() - DAY_IN_MS);
  const finalSunday = weekDays(finalDay)[6];
  const count = Math.round((finalSunday.getTime() - firstMonday.getTime()) / DAY_IN_MS) + 1;
  return Array.from({ length: count }, (_, index) => new Date(firstMonday.getTime() + index * DAY_IN_MS));
}

export function dayBounds(date: Date): DateRange {
  const key = dateKey(date);
  const from = new Date(`${key}T00:00:00${VIETNAM_OFFSET}`);
  const to = new Date(from.getTime() + DAY_IN_MS - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function weekBounds(anchor: Date): DateRange {
  const days = weekDays(anchor);
  return { from: dayBounds(days[0]).from, to: dayBounds(days[6]).to };
}

export function monthBounds(anchor: Date): DateRange {
  const days = monthGridDays(anchor);
  return { from: dayBounds(days[0]).from, to: dayBounds(days[days.length - 1]).to };
}

export function viewRange(view: CalendarView, anchor: Date): DateRange {
  if (view === "today") return dayBounds(anchor);
  if (view === "week") return weekBounds(anchor);
  return monthBounds(anchor);
}

export function shiftAnchor(anchor: Date, view: CalendarView, amount: number): Date {
  const [year, month, day] = dateKey(anchor).split("-").map(Number);
  if (view !== "month") {
    const days = view === "today" ? amount : amount * 7;
    return new Date(vietnamDate(anchor).getTime() + days * DAY_IN_MS);
  }
  const targetMonthStart = new Date(Date.UTC(year, month - 1 + amount, 1));
  const targetYear = targetMonthStart.getUTCFullYear();
  const targetMonth = targetMonthStart.getUTCMonth() + 1;
  const nextMonthStart = new Date(Date.UTC(targetYear, targetMonth, 1));
  const daysInTargetMonth = new Date(nextMonthStart.getTime() - DAY_IN_MS).getUTCDate();
  const targetDay = Math.min(day, daysInTargetMonth);
  return new Date(`${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}T12:00:00${VIETNAM_OFFSET}`);
}

export function formatVietnameseDate(date: Date): string {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "long", day: "numeric", month: "long", timeZone: VIETNAM_TIME_ZONE,
  }).format(date);
}

export function formatVietnameseRangeTitle(view: CalendarView, anchor: Date): string {
  if (view === "today") return formatVietnameseDate(anchor);
  if (view === "month") {
    const value = new Intl.DateTimeFormat("vi-VN", {
      month: "long", year: "numeric", timeZone: VIETNAM_TIME_ZONE,
    }).format(vietnamDate(anchor));
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  const days = weekDays(anchor);
  const format = (date: Date) => new Intl.DateTimeFormat("vi-VN", {
    day: "numeric", month: "numeric", year: "numeric", timeZone: VIETNAM_TIME_ZONE,
  }).format(date);
  return `${format(days[0])} – ${format(days[6])}`;
}

export function toMonthInputValue(date: Date): string {
  return dateKey(date).slice(0, 7);
}

export function parseMonthInputValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const date = new Date(`${match[1]}-${match[2]}-01T12:00:00${VIETNAM_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: VIETNAM_TIME_ZONE,
  }).format(new Date(iso));
}

export function toDateTimeLocal(iso: string): string {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: VIETNAM_TIME_ZONE,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function parseVietnamDateTime(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00${VIETNAM_OFFSET}`);
  if (Number.isNaN(date.getTime())) return null;
  return toDateTimeLocal(date.toISOString()) === value ? date : null;
}
