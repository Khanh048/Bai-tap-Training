"use client";

import { useState } from "react";
import { BatteryCharging, CalendarPlus, Leaf, Minus, Plus, Save, Sparkles } from "lucide-react";
import { ActivityCard } from "@/components/activity-card";
import { clampEnergy, endOfDayEnergy, energyBand, forecastActivities } from "@/lib/energy";
import type { Activity, DailyCheckin, ForecastActivity } from "@/lib/types";

export function TodayView({ activities, visibleActivityIds, pendingActivityIds, checkin, defaultEnergy, nowIso, savingCheckin, onSaveCheckin, onAdd, onComplete, onEdit, onSkip, onDelete }: {
  activities: Activity[]; visibleActivityIds: Set<string>; pendingActivityIds: ReadonlySet<string>; checkin: DailyCheckin | null; defaultEnergy: number; nowIso: string; savingCheckin: boolean;
  onSaveCheckin: (energy: number, note: string) => Promise<void>; onAdd: () => void;
  onComplete: (activity: ForecastActivity) => void; onEdit: (activity: Activity) => void; onSkip: (activity: Activity) => void; onDelete: (activity: Activity) => void;
}) {
  const energy = checkin?.energy_level ?? defaultEnergy;
  const note = checkin?.note ?? "";
  const fullForecast = forecastActivities(activities, energy);
  const forecast = fullForecast.filter((item) => visibleActivityIds.has(item.id));
  const endEnergy = endOfDayEnergy(activities, energy);
  const band = energyBand(endEnergy);
  const description = band === "low"
    ? "Ngày có vẻ khá đầy. Một khoảng nghỉ nhẹ có thể giúp bạn hồi pin."
    : band === "medium"
      ? "Nhịp ngày đang ở mức vừa phải. Bạn có thể chừa thêm một khoảng thở nhỏ."
      : "Lịch hôm nay trông khá vừa sức. Nhớ cập nhật cảm nhận sau mỗi việc nhé.";
  return <div className="space-y-6">
    <section className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
      <CheckinCard key={`${checkin?.id ?? "new"}-${checkin?.checkin_date ?? "today"}-${energy}-${note}`} energy={energy} note={note} saving={savingCheckin} onSave={onSaveCheckin} />
      <div className={`forecast-card forecast-card-${band}`}><div className="flex items-center justify-between"><span className="forecast-card-icon grid size-11 place-items-center rounded-2xl"><BatteryCharging size={22} /></span><span className="forecast-card-label text-xs font-bold uppercase tracking-[.16em]">Cuối ngày dự kiến</span></div><div className="mt-8 flex items-end gap-2"><strong className="text-5xl leading-none">{endEnergy}</strong><span className="forecast-card-label pb-1 text-lg">%</span></div><div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={endEnergy} aria-label={`Năng lượng dự kiến cuối ngày ${endEnergy}%`} className="forecast-progress mt-5 h-2.5 overflow-hidden rounded-full"><div className="forecast-progress-fill h-full rounded-full" style={{ width: `${endEnergy}%` }} /></div><p className="forecast-card-description mt-4 text-sm leading-6">{description}</p></div>
    </section>
    <section className="surface-card p-4 sm:p-6"><div className="mb-5 flex items-center justify-between gap-3"><div><p className="eyebrow mb-2"><Sparkles size={13} />Dòng năng lượng</p><h2 className="text-xl font-bold text-ink-900">Nhịp ngày hôm nay</h2><p className="mt-1 text-sm text-ink-500">Năng lượng trước → sau mỗi hoạt động</p></div><button onClick={onAdd} className="button-primary shrink-0"><CalendarPlus size={18} /><span className="hidden sm:inline">Thêm hoạt động</span><span className="sm:hidden">Thêm</span></button></div>
      {forecast.length ? <div className="relative space-y-3 before:absolute before:bottom-4 before:left-[19px] before:top-4 before:w-px before:bg-sage-200">{forecast.map((activity) => <div key={activity.id} className="relative pl-10"><span className="absolute left-[14px] top-6 z-[1] size-3 rounded-full border-2 border-white bg-sage-500 ring-2 ring-sage-200" /><ActivityCard activity={activity} nowIso={nowIso} pending={pendingActivityIds.has(activity.id)} onComplete={() => onComplete(activity)} onEdit={() => onEdit(activity)} onSkip={() => onSkip(activity)} onDelete={() => onDelete(activity)} /></div>)}</div> : <div className="grid place-items-center rounded-2xl border border-dashed border-sage-300 bg-white/70 px-5 py-12 text-center"><span className="grid size-12 place-items-center rounded-2xl bg-sage-100 text-sage-700"><Leaf /></span><h3 className="mt-4 font-bold text-ink-900">Một ngày còn thật thoáng</h3><p className="mt-2 max-w-sm text-sm leading-6 text-ink-500">Thêm điều bạn muốn làm, hoặc giữ khoảng trống này để nghỉ ngơi.</p><button onClick={onAdd} className="button-secondary mt-5">Thêm hoạt động đầu tiên</button></div>}
    </section>
  </div>;
}

function CheckinCard({ energy: initial, note: initialNote, saving, onSave }: { energy: number; note: string; saving: boolean; onSave: (energy: number, note: string) => Promise<void> }) {
  const [energy, setEnergy] = useState(clampEnergy(initial));
  const [note, setNote] = useState(initialNote);
  const feeling = energy >= 80 ? "Đang rất sẵn sàng" : energy >= 60 ? "Khá ổn và vững vàng" : energy >= 40 ? "Cần đi chậm một chút" : "Nên ưu tiên nghỉ ngơi";
  return <div className="checkin-card" data-tour="energy-checkin"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold text-sage-700">Check-in buổi sáng</p><h2 className="mt-1 text-xl font-bold text-ink-900">Bây giờ bạn thấy thế nào?</h2><p className="mt-1 text-xs text-ink-500">Chọn mọi số nguyên từ 0 đến 100</p></div><div className="energy-orb"><strong>{energy}</strong><span>%</span></div></div>
    <input aria-label="Năng lượng hiện tại" type="range" min="0" max="100" step="1" value={energy} onChange={(event) => setEnergy(Number(event.target.value))} className="energy-range mt-6" />
    <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-ink-400">Cần nghỉ</span><div className="energy-stepper"><button type="button" disabled={energy <= 0} onClick={() => setEnergy((value) => clampEnergy(value - 1))} aria-label="Giảm 1 năng lượng"><Minus size={15} /></button><input aria-label="Năng lượng hiện tại chính xác" type="number" min="0" max="100" step="1" value={energy} onChange={(event) => setEnergy(clampEnergy(Number(event.target.value)))} /><span>%</span><button type="button" disabled={energy >= 100} onClick={() => setEnergy((value) => clampEnergy(value + 1))} aria-label="Tăng 1 năng lượng"><Plus size={15} /></button></div><span className="text-xs text-ink-400">Đầy năng lượng</span></div>
    <div className="mt-4 flex flex-wrap justify-center gap-2">{[20, 40, 60, 80, 100].map((value) => <button key={value} type="button" onClick={() => setEnergy(value)} className={`chip ${energy === value ? "chip-active" : ""}`}>{value}%</button>)}</div>
    <p className="mt-4 rounded-xl bg-sage-50/90 px-4 py-3 text-sm font-semibold text-sage-800">{feeling}</p><div className="mt-4 flex gap-2"><input aria-label="Ghi chú check-in" value={note} onChange={(event) => setNote(event.target.value)} className="field" placeholder="Một điều bạn muốn ghi nhớ..." /><button type="button" disabled={saving} onClick={() => void onSave(energy, note)} className="button-secondary shrink-0" aria-label="Lưu check-in"><Save size={17} /><span className="hidden sm:inline">Lưu</span></button></div></div>;
}
