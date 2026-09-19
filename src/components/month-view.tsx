"use client";

import { Plus } from "lucide-react";
import { dateKey, formatTime, monthGridDays, VIETNAM_TIME_ZONE } from "@/lib/dates";
import { endOfDayEnergy } from "@/lib/energy";
import type { Activity, DailyCheckin } from "@/lib/types";

export function MonthView({ anchor, activities, visibleActivityIds, checkins, defaultEnergy, now, onAdd, onEdit }: { anchor: Date; activities: Activity[]; visibleActivityIds: ReadonlySet<string>; checkins: DailyCheckin[]; defaultEnergy: number; now: Date; onAdd: (date: Date) => void; onEdit: (activity: Activity) => void }) {
  const days = monthGridDays(anchor);
  const todayKey = dateKey(now);
  const month = dateKey(anchor).slice(0, 7);
  const dayFormatter = new Intl.DateTimeFormat("vi-VN", { day: "numeric", timeZone: VIETNAM_TIME_ZONE });
  return <div className="overflow-x-auto pb-3"><div className="surface-card min-w-[720px] overflow-hidden"><div className="grid grid-cols-7 border-b border-sage-200 bg-sage-50/80">{["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((label) => <div key={label} className="p-2 text-center text-xs font-extrabold text-ink-500">{label}</div>)}</div><div className="grid grid-cols-7">{days.map((day) => {
    const key = dateKey(day); const outside = !key.startsWith(month); const pastDay = key < todayKey;
    const items = activities.filter((item) => dateKey(new Date(item.starts_at)) === key);
    const shownItems = items.filter((item) => visibleActivityIds.has(item.id));
    const checkin = checkins.find((item) => item.checkin_date === key);
    const end = endOfDayEnergy(items, checkin?.energy_level ?? defaultEnergy);
    return <section key={key} onClick={() => onAdd(day)} className={`calendar-day group min-h-36 border-b border-r border-sage-100 p-2 align-top ${outside ? "calendar-day-outside text-ink-400" : "bg-white/85"} ${pastDay ? "opacity-70" : ""} ${key === todayKey ? "calendar-day-today" : ""}`}><header className="flex items-center justify-between"><span className={`grid size-7 place-items-center rounded-full text-sm font-bold ${key === todayKey ? "bg-sage-700 text-white" : "text-ink-700"}`}>{dayFormatter.format(day)}</span><button type="button" className="rounded-lg p-1 text-sage-700 opacity-0 group-hover:opacity-100" aria-label={`Thêm hoạt động ngày ${key}`}><Plus size={15} /></button></header><p className="my-1.5 text-[10px] font-semibold text-ink-400">{checkin ? `Pin ${checkin.energy_level}%` : `Ước tính ${end}%`}</p><div className="space-y-1">{shownItems.slice(0, 3).map((item) => <button type="button" key={item.id} onClick={(event) => { event.stopPropagation(); onEdit(item); }} className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[10px] font-bold ${item.status === "cancelled" || item.status === "skipped" ? "bg-sage-50 text-ink-400 line-through" : item.ends_at < now.toISOString() ? "bg-sage-50 text-ink-400 opacity-70" : item.expected_impact < 0 ? "bg-amber-100 text-amber-900" : "bg-sage-100 text-sage-800"}`}><span className="mr-1 font-normal">{formatTime(item.starts_at)}</span>{item.title}</button>)}{shownItems.length > 3 && <p className="px-1 text-[10px] font-bold text-ink-500">+{shownItems.length - 3} hoạt động</p>}</div></section>;
  })}</div></div></div>;
}
