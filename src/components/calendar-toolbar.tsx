"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { formatVietnameseRangeTitle, parseMonthInputValue, toMonthInputValue, type CalendarView } from "@/lib/dates";

export function CalendarToolbar({ view, anchor, onViewChange, onAnchorChange, onAnchorSelect, onToday }: {
  view: CalendarView;
  anchor: Date;
  onViewChange: (view: CalendarView) => void;
  onAnchorChange: (direction: -1 | 1) => void;
  onAnchorSelect: (date: Date) => void;
  onToday: () => void;
}) {
  return <section data-tour="calendar-controls" className="calendar-toolbar mb-5 rounded-2xl border p-3 sm:p-4">
    <div className="flex flex-wrap items-center gap-2">
      <div className="calendar-view-switch inline-flex rounded-xl p-1">{(["today", "week", "month"] as const).map((item) => <button key={item} type="button" onClick={() => onViewChange(item)} className={`calendar-view-option rounded-lg px-3 py-2 text-xs font-bold sm:text-sm ${view === item ? "calendar-view-option-active" : "text-ink-600"}`}>{item === "today" ? "Ngày" : item === "week" ? "Tuần" : "Tháng"}</button>)}</div>
      <div className="ml-auto flex items-center gap-1"><button type="button" onClick={() => onAnchorChange(-1)} className="theme-icon-button rounded-xl p-2 text-ink-600" aria-label="Khoảng trước"><ChevronLeft size={19} /></button><button type="button" onClick={onToday} className="button-secondary px-3 py-2">Về hôm nay</button><button type="button" onClick={() => onAnchorChange(1)} className="theme-icon-button rounded-xl p-2 text-ink-600" aria-label="Khoảng sau"><ChevronRight size={19} /></button></div>
    </div>
    <div className="calendar-toolbar-divider mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3"><h1 className="text-lg font-bold capitalize text-ink-900 sm:text-xl">{formatVietnameseRangeTitle(view, anchor)}</h1><label className="text-xs font-bold text-ink-500">Đi đến tháng<input type="month" value={toMonthInputValue(anchor)} onChange={(event) => { const value = parseMonthInputValue(event.target.value); if (value) { onViewChange("month"); onAnchorSelect(value); } }} className="field ml-2 inline-block w-auto py-2" /></label></div>
  </section>;
}
