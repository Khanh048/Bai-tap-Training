"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { ActivityDateContext } from "@/components/activity-form";
import { SegmentedControl, type ChoiceOption } from "@/components/ui/choice-control";
import { parseVietnamDateTime, toDateTimeLocal } from "@/lib/dates";
import { forecastActivities, hasOverlap } from "@/lib/energy";
import type { Activity, Todo, TodoDraft } from "@/lib/types";

const durationOptions: readonly ChoiceOption<string>[] = [
  { value: "30", label: "30 phút" },
  { value: "60", label: "1 giờ" },
  { value: "90", label: "1,5 giờ" },
  { value: "120", label: "2 giờ" },
];

export interface TodoFormDraft extends TodoDraft {
  starts_at: string;
  ends_at: string;
  expected_impact: number;
}

interface TodoFormProps {
  todo?: Todo;
  linkedActivity?: Activity | null;
  defaultDate: string;
  initialTitle?: string;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
  onLoadDateContext: (date: string) => Promise<ActivityDateContext>;
  onSave: (draft: TodoFormDraft) => Promise<void>;
}

export function TodoForm({ todo, linkedActivity, defaultDate, initialTitle = "", onCancel, onBusyChange, onLoadDateContext, onSave }: TodoFormProps) {
  const linkedStart = linkedActivity ? toDateTimeLocal(linkedActivity.starts_at) : null;
  const [title, setTitle] = useState(todo?.title ?? initialTitle);
  const [date, setDate] = useState(todo?.scheduled_date ?? defaultDate);
  const [time, setTime] = useState(linkedStart?.slice(11, 16) ?? (todo?.due_at ? toDateTimeLocal(todo.due_at).slice(11, 16) : "09:00"));
  const [duration, setDuration] = useState(() => linkedActivity ? String(Math.round((new Date(linkedActivity.ends_at).getTime() - new Date(linkedActivity.starts_at).getTime()) / 60_000)) : "30");
  const [impact, setImpact] = useState(linkedActivity?.expected_impact ?? -5);
  const [note, setNote] = useState(todo?.note ?? linkedActivity?.note ?? "");
  const [context, setContext] = useState<ActivityDateContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [contextLoading, setContextLoading] = useState(true);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    void onLoadDateContext(date).then((value) => { if (id === requestId.current) setContext(value); }).catch(() => { if (id === requestId.current) setContext(null); }).finally(() => { if (id === requestId.current) setContextLoading(false); });
  }, [date, onLoadDateContext]);

  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);

  const preview = useMemo(() => {
    const start = parseVietnamDateTime(`${date}T${time}`);
    if (!start || !context) return null;
    const end = new Date(start.getTime() + Number(duration) * 60_000);
    const candidate: Activity = {
      id: linkedActivity?.id ?? "todo-preview",
      user_id: linkedActivity?.user_id ?? "preview",
      title: title.trim() || "Việc cần làm",
      category: "personal",
      schedule_type: "flexible",
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      expected_impact: impact,
      actual_energy_after: null,
      status: linkedActivity?.status ?? "scheduled",
      note: note.trim(),
      series_id: null,
      recurrence: "none",
      recurrence_end_date: null,
      occurrence_index: 0,
      overdue_acknowledged_at: null,
      created_at: linkedActivity?.created_at ?? start.toISOString(),
      updated_at: linkedActivity?.updated_at ?? start.toISOString(),
    };
    const others = context.activities.filter((item) => item.id !== linkedActivity?.id);
    const forecast = forecastActivities([...others, candidate], context.initialEnergy);
    return { overlap: hasOverlap(candidate, others), energy: forecast.find((item) => item.id === candidate.id)?.predicted_after ?? context.initialEnergy };
  }, [context, date, duration, impact, linkedActivity, note, time, title]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle || cleanTitle.length > 160) { setError("Tiêu đề cần có từ 1 đến 160 ký tự."); return; }
    const start = parseVietnamDateTime(`${date}T${time}`);
    if (!start) { setError("Ngày hoặc giờ bắt đầu chưa hợp lệ."); return; }
    if (!Number.isInteger(impact) || impact < -50 || impact > 50) { setError("Tác động dự kiến phải là số nguyên từ -50 đến 50."); return; }
    const minutes = Number(duration);
    if (![30, 60, 90, 120].includes(minutes)) { setError("Thời lượng chưa hợp lệ."); return; }
    setBusy(true); setError("");
    try {
      await onSave({
        title: cleanTitle,
        scheduled_date: date,
        due_at: start.toISOString(),
        note: note.trim(),
        activity_id: todo?.activity_id ?? null,
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + minutes * 60_000).toISOString(),
        expected_impact: impact,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chưa thể lưu việc cần làm.");
    } finally { setBusy(false); }
  }

  const warn = preview && (preview.overlap || preview.energy < 30);
  return <form onSubmit={submit} className="space-y-3">
    <label className="block text-sm font-bold text-ink-800">Việc cần làm<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} className="field mt-1.5" placeholder="Một việc vừa sức…" /></label>
    <div className="grid grid-cols-2 gap-3">
      <label className="text-xs font-bold text-ink-700">Ngày<input required type="date" value={date} onChange={(event) => { setContextLoading(true); setDate(event.target.value); }} className="field mt-1.5" /></label>
      <label className="text-xs font-bold text-ink-700">Bắt đầu<input required type="time" value={time} onChange={(event) => setTime(event.target.value)} className="field mt-1.5" /></label>
    </div>
    <div><span className="text-xs font-bold text-ink-700">Thời lượng</span><div className="mt-1.5"><SegmentedControl label="Thời lượng việc cần làm" value={duration} onChange={setDuration} compact options={durationOptions} /></div></div>
    <label className="block text-xs font-bold text-ink-700">Tác động năng lượng ({impact > 0 ? "+" : ""}{impact})<input aria-label="Tác động năng lượng" type="range" min="-50" max="50" step="1" value={impact} onChange={(event) => setImpact(Number(event.target.value))} className="energy-range mt-2" /></label>
    <label className="block text-xs font-bold text-ink-700">Ghi chú<textarea value={note} onChange={(event) => setNote(event.target.value)} className="field mt-1.5 min-h-16 resize-y" placeholder="Một gợi ý nhỏ để dễ bắt đầu" /></label>
    {contextLoading && <p className="flex items-center gap-2 text-xs text-ink-500"><LoaderCircle className="animate-spin" size={14} />Đang xem nhịp năng lượng ngày này…</p>}
    {preview && <p className="text-xs text-ink-500">Năng lượng dự kiến sau việc: <strong className={preview.energy < 30 ? "text-amber-800" : "text-sage-700"}>{preview.energy}%</strong></p>}
    {warn && <p className="rounded-xl bg-amber-100 px-3 py-2 text-sm leading-5 text-amber-900">Ngày này có vẻ đã khá đầy… bạn có muốn chọn lúc nhẹ hơn không?</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-2 border-t border-sage-100 pt-3"><button type="button" disabled={busy} onClick={onCancel} className="button-secondary">Để sau</button><button disabled={busy} className="button-primary">{busy && <LoaderCircle className="animate-spin" size={17} />}{todo ? "Lưu" : "Thêm việc"}</button></div>
  </form>;
}
