"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BookOpen, BriefcaseBusiness, CalendarClock, Coffee, LoaderCircle, Sparkles, UserRound, Users } from "lucide-react";
import { z } from "zod";
import { SegmentedControl, type ChoiceOption } from "@/components/ui/choice-control";
import { forecastActivities, hasOverlap } from "@/lib/energy";
import { dateKey, parseVietnamDateTime, toDateTimeLocal } from "@/lib/dates";
import { categoryLabels, scheduleLabels, type ActionScope, type Activity, type ActivityDraft } from "@/lib/types";

const activitySchema = z.object({
  title: z.string().trim().min(1, "Hãy đặt tên cho hoạt động.").max(160, "Tên hoạt động quá dài."),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  expectedImpact: z.number().int("Tác động phải là số nguyên.").min(-50).max(50),
}).refine((value) => !value.startsAt || !value.endsAt || value.startsAt.slice(0, 10) === value.endsAt.slice(0, 10), {
  message: "Hoạt động cần bắt đầu và kết thúc trong cùng một ngày.",
  path: ["endsAt"],
}).refine((value) => {
  const start = parseVietnamDateTime(value.startsAt);
  const end = parseVietnamDateTime(value.endsAt);
  return Boolean(start && end && end > start);
}, { message: "Giờ kết thúc cần sau giờ bắt đầu.", path: ["endsAt"] });

const categoryChoices: readonly ChoiceOption<ActivityDraft["category"]>[] = [
  { value: "study", label: categoryLabels.study, icon: <BookOpen size={17} /> },
  { value: "work", label: categoryLabels.work, icon: <BriefcaseBusiness size={17} /> },
  { value: "social", label: categoryLabels.social, icon: <Users size={17} /> },
  { value: "personal", label: categoryLabels.personal, icon: <UserRound size={17} /> },
  { value: "rest", label: categoryLabels.rest, icon: <Coffee size={17} /> },
];

const scheduleChoices: readonly ChoiceOption<ActivityDraft["schedule_type"]>[] = [
  { value: "fixed", label: scheduleLabels.fixed, description: "Giờ đã chốt, khó dời", icon: <CalendarClock size={18} /> },
  { value: "flexible", label: scheduleLabels.flexible, description: "Có thể chuyển khi cần", icon: <Sparkles size={18} /> },
];

export interface ActivityDateContext {
  activities: Activity[];
  initialEnergy: number;
}

type PreviewContext = ActivityDateContext & {
  date: string;
  status: "loading" | "ready" | "unavailable";
};

function clampImpact(value: number): number {
  return Math.min(50, Math.max(-50, Math.round(value)));
}

export function ActivityForm({ activity, activities, initialEnergy, initialContextAvailable, defaultStart, onCancel, onBusyChange, onLoadDateContext, onSave }: {
  activity?: Activity;
  activities: Activity[];
  initialEnergy: number;
  initialContextAvailable: boolean;
  defaultStart: string;
  onCancel: () => void;
  onBusyChange: (busy: boolean) => void;
  onLoadDateContext: (date: string) => Promise<ActivityDateContext>;
  onSave: (draft: ActivityDraft, scope: ActionScope) => Promise<void>;
}) {
  const startRef = useRef<HTMLInputElement>(null);
  const contextRequest = useRef(0);
  const initialStart = activity ? toDateTimeLocal(activity.starts_at) : defaultStart;
  const initialDate = initialStart.slice(0, 10);
  const initialContext: ActivityDateContext = {
    activities: activities.filter((item) => dateKey(new Date(item.starts_at)) === initialDate),
    initialEnergy,
  };
  const defaultStartDate = parseVietnamDateTime(defaultStart) ?? new Date();
  const initialEnd = activity ? toDateTimeLocal(activity.ends_at) : toDateTimeLocal(new Date(defaultStartDate.getTime() + 60 * 60 * 1000).toISOString());
  const [title, setTitle] = useState(activity?.title ?? "");
  const [category, setCategory] = useState<ActivityDraft["category"]>(activity?.category ?? "work");
  const [scheduleType, setScheduleType] = useState<ActivityDraft["schedule_type"]>(activity?.schedule_type ?? "fixed");
  const [startsAt, setStartsAt] = useState(initialStart);
  const [endsAt, setEndsAt] = useState(initialEnd);
  const [impact, setImpact] = useState(activity?.expected_impact ?? -10);
  const [note, setNote] = useState(activity?.note ?? "");
  const [recurrence, setRecurrence] = useState<ActivityDraft["recurrence"]>(activity?.recurrence ?? "none");
  const [recurrenceEndMode, setRecurrenceEndMode] = useState<"date" | "forever">(activity?.recurrence_end_date ? "date" : "forever");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(activity?.recurrence_end_date ?? initialDate);
  const [scope, setScope] = useState<ActionScope>("single");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewContext, setPreviewContext] = useState<PreviewContext>(() => ({
    date: initialDate,
    status: initialContextAvailable ? "ready" : "loading",
    ...initialContext,
  }));

  useEffect(() => {
    if (initialContextAvailable) return;
    const request = ++contextRequest.current;
    let active = true;
    void onLoadDateContext(initialDate).then((context) => {
      if (active && contextRequest.current === request) setPreviewContext({ date: initialDate, status: "ready", ...context });
    }).catch(() => {
      if (active && contextRequest.current === request) setPreviewContext({ date: initialDate, status: "unavailable", activities: [], initialEnergy });
    });
    return () => { active = false; };
  }, [initialContextAvailable, initialDate, initialEnergy, onLoadDateContext]);

  const candidate = useMemo((): Activity | null => {
    const start = parseVietnamDateTime(startsAt);
    const end = parseVietnamDateTime(endsAt);
    if (!start || !end) return null;
    const effectiveRecurrence = scheduleType === "fixed" ? recurrence : "none";
    return {
      id: activity?.id ?? "draft", user_id: activity?.user_id ?? "draft", title, category, schedule_type: scheduleType,
      starts_at: start.toISOString(), ends_at: end.toISOString(), expected_impact: impact,
      actual_energy_after: activity?.actual_energy_after ?? null, status: activity?.status ?? "scheduled", note,
      series_id: activity?.series_id ?? null, recurrence: effectiveRecurrence,
      recurrence_end_date: effectiveRecurrence === "weekly" && recurrenceEndMode === "date" ? recurrenceEndDate : null,
      occurrence_index: activity?.occurrence_index ?? 0,
      overdue_acknowledged_at: activity?.overdue_acknowledged_at ?? null,
      created_at: activity?.created_at ?? "", updated_at: activity?.updated_at ?? "",
    };
  }, [activity, category, endsAt, impact, note, recurrence, recurrenceEndDate, recurrenceEndMode, scheduleType, startsAt, title]);
  const candidateDate = candidate ? dateKey(new Date(candidate.starts_at)) : startsAt.slice(0, 10);
  const previewReady = Boolean(candidate && previewContext.date === candidateDate && previewContext.status === "ready");
  const sameDayActivities = previewReady ? previewContext.activities : [];
  const overlap = candidate && previewReady ? hasOverlap(candidate, sameDayActivities) : false;
  const projected = candidate && previewReady
    ? forecastActivities([...sameDayActivities.filter((item) => item.id !== activity?.id), candidate], previewContext.initialEnergy).find((item) => item.id === candidate.id)?.predicted_after ?? previewContext.initialEnergy
    : null;

  function changeStart(value: string) {
    setStartsAt(value);
    const date = value.slice(0, 10);
    const request = ++contextRequest.current;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (date === initialDate && initialContextAvailable) {
      setPreviewContext({ date, status: "ready", ...initialContext });
      return;
    }
    setPreviewContext({ date, status: "loading", activities: [], initialEnergy });
    void onLoadDateContext(date).then((context) => {
      if (contextRequest.current === request) setPreviewContext({ date, status: "ready", ...context });
    }).catch(() => {
      if (contextRequest.current === request) setPreviewContext({ date, status: "unavailable", activities: [], initialEnergy });
    });
  }

  function setDuration(minutes: number) {
    const start = parseVietnamDateTime(startsAt);
    if (start) setEndsAt(toDateTimeLocal(new Date(start.getTime() + minutes * 60_000).toISOString()));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const parsed = activitySchema.safeParse({ title, startsAt, endsAt, expectedImpact: impact });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Thông tin chưa hợp lệ.");
      return;
    }
    const start = parseVietnamDateTime(parsed.data.startsAt);
    const end = parseVietnamDateTime(parsed.data.endsAt);
    if (!start || !end) {
      setError("Ngày giờ chưa hợp lệ.");
      return;
    }
    const effectiveRecurrence = scheduleType === "fixed" ? recurrence : "none";
    const effectiveEndDate = effectiveRecurrence === "weekly" && recurrenceEndMode === "date" ? recurrenceEndDate : null;
    const selectedSeriesEndDate = recurrenceEndMode === "date" ? recurrenceEndDate : null;
    if (activity?.series_id && scope === "single" && selectedSeriesEndDate !== activity.recurrence_end_date) {
      setError("Ngày kết thúc lặp thuộc cả chuỗi. Hãy chọn ‘Buổi này + sau’ hoặc ‘Cả chuỗi’ để thay đổi.");
      return;
    }
    if (effectiveEndDate !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveEndDate) || !parseVietnamDateTime(`${effectiveEndDate}T00:00`)) {
        setError("Hãy chọn ngày kết thúc lặp hợp lệ.");
        return;
      }
      const endUsesEditedStart = !activity?.series_id || scope === "future";
      if (endUsesEditedStart && effectiveEndDate < parsed.data.startsAt.slice(0, 10)) {
        setError(scope === "future"
          ? "Ngày kết thúc lặp cần bằng hoặc sau ngày bắt đầu của nhánh mới."
          : "Ngày kết thúc lặp cần bằng hoặc sau ngày bắt đầu.");
        return;
      }
    }
    setBusy(true);
    onBusyChange(true);
    try {
      await onSave({ title: parsed.data.title, category, schedule_type: scheduleType, starts_at: start.toISOString(), ends_at: end.toISOString(), expected_impact: parsed.data.expectedImpact, note: note.trim(), recurrence: effectiveRecurrence, recurrence_end_date: effectiveEndDate }, scope);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Chưa thể lưu hoạt động.");
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  return <form onSubmit={submit} className="space-y-5">
    <label className="block text-sm font-bold text-ink-800">Tên hoạt động<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} className="field mt-2" placeholder="Bạn định làm gì?" /></label>
    <fieldset>
      <legend className="text-sm font-bold text-ink-800">Nhóm hoạt động</legend>
      <div className="category-choice-grid">
        {categoryChoices.map((choice) => <button key={choice.value} type="button" aria-pressed={category === choice.value} data-category={choice.value} className="category-choice" onClick={() => setCategory(choice.value)}><span aria-hidden="true">{choice.icon}</span><strong>{choice.label}</strong></button>)}
      </div>
    </fieldset>
    <fieldset>
      <legend className="mb-2 text-sm font-bold text-ink-800">Kiểu lịch</legend>
      <SegmentedControl label="Kiểu lịch" value={scheduleType} options={scheduleChoices} onChange={setScheduleType} />
    </fieldset>
    <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold text-ink-800">Bắt đầu<input ref={startRef} type="datetime-local" value={startsAt} onChange={(event) => changeStart(event.target.value)} className="field mt-2" /></label><label className="block text-sm font-bold text-ink-800">Kết thúc<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="field mt-2" /></label></div>
    <div><span className="text-sm font-bold text-ink-800">Thời lượng nhanh</span><div className="mt-2 flex flex-wrap gap-2">{[30, 60, 90, 120].map((minutes) => <button key={minutes} type="button" onClick={() => setDuration(minutes)} className="chip">{minutes < 60 ? `${minutes} phút` : `${minutes / 60} giờ`}</button>)}</div></div>
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><label htmlFor="impact" className="text-sm font-bold text-ink-800">Tác động dự kiến</label><p className="mt-0.5 text-xs text-ink-500">Chọn mọi số nguyên từ -50 đến 50</p></div><div className="energy-stepper" aria-label="Điều chỉnh tác động dự kiến"><button type="button" onClick={() => setImpact((value) => clampImpact(value - 1))} disabled={impact <= -50} aria-label="Giảm 1 năng lượng">−</button><input aria-label="Tác động dự kiến chính xác" type="number" min="-50" max="50" step="1" value={impact} onChange={(event) => setImpact(clampImpact(Number(event.target.value)))} /><span>điểm</span><button type="button" onClick={() => setImpact((value) => clampImpact(value + 1))} disabled={impact >= 50} aria-label="Tăng 1 năng lượng">+</button></div></div>
      <input id="impact" type="range" min="-50" max="50" step="1" value={impact} onChange={(event) => setImpact(Number(event.target.value))} className="energy-range mt-4" />
      <div className="mt-3 flex flex-wrap gap-2">{[-30, -15, 0, 15, 30].map((value) => <button type="button" key={value} onClick={() => setImpact(value)} className={`chip ${impact === value ? "chip-active" : ""}`}>{value > 0 ? "+" : ""}{value}</button>)}</div>
    </div>
    <label className="block text-sm font-bold text-ink-800">Ghi chú<textarea value={note} onChange={(event) => setNote(event.target.value)} className="field mt-2 min-h-20 resize-y" placeholder="Điều gì giúp hoạt động này dễ chịu hơn?" /></label>
    <fieldset disabled={scheduleType === "flexible"} className={`surface-muted space-y-3 p-4 transition-opacity ${scheduleType === "flexible" ? "opacity-50" : ""}`}>
      <legend className="px-1 text-sm font-bold text-ink-800">Lặp lại và kết thúc</legend>
      <label className="flex items-start gap-3"><input type="checkbox" checked={recurrence === "weekly"} onChange={(event) => setRecurrence(event.target.checked ? "weekly" : "none")} className="mt-1 size-4 accent-sage-700" /><span><strong className="block text-sm text-ink-800">Lặp lại mỗi tuần</strong><span className="mt-1 block text-xs leading-5 text-ink-500">Chỉ tạo các buổi khi khoảng lịch đang xem cần đến.</span></span></label>
      <div className={`grid gap-2 sm:grid-cols-2 ${recurrence !== "weekly" ? "opacity-50" : ""}`}>
        <label className="flex items-center gap-2 rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700"><input type="radio" name="recurrence-end" checked={recurrenceEndMode === "date"} disabled={recurrence !== "weekly"} onChange={() => setRecurrenceEndMode("date")} />Theo ngày</label>
        <label className="flex items-center gap-2 rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700"><input type="radio" name="recurrence-end" checked={recurrenceEndMode === "forever"} disabled={recurrence !== "weekly"} onChange={() => setRecurrenceEndMode("forever")} />Vĩnh viễn</label>
      </div>
      {recurrenceEndMode === "date" && <label className={`block text-xs font-bold text-ink-700 ${recurrence !== "weekly" ? "opacity-50" : ""}`}>Lặp đến hết ngày<input type="date" min={scheduleType === "fixed" && recurrence === "weekly" && (!activity?.series_id || scope === "future") ? startsAt.slice(0, 10) : undefined} value={recurrenceEndDate} disabled={recurrence !== "weekly"} onChange={(event) => setRecurrenceEndDate(event.target.value)} className="field mt-1.5" /></label>}
      {scheduleType === "flexible" && <p className="text-xs leading-5 text-ink-500">Lịch linh hoạt luôn là một buổi, không lặp.</p>}
    </fieldset>
    {activity?.series_id && <fieldset><legend className="text-sm font-bold text-ink-800">Áp dụng thay đổi cho</legend><div className="mt-2 grid grid-cols-3 gap-2">{(["single", "future", "all"] as const).map((item) => <label key={item} className={`cursor-pointer rounded-xl border p-2 text-center text-xs font-bold ${scope === item ? "border-sage-600 bg-sage-50 text-sage-800" : "border-sage-200"}`}><input className="sr-only" type="radio" checked={scope === item} onChange={() => setScope(item)} />{item === "single" ? "Buổi này" : item === "future" ? "Buổi này + sau" : "Cả chuỗi"}</label>)}</div></fieldset>}
    {scheduleType === "fixed" && recurrence === "weekly" && <p className="text-xs leading-5 text-ink-500">Cảnh báo bên dưới chỉ xem trước lần xuất hiện đầu tiên; các buổi lặp sau chưa được kiểm tra trong form này.</p>}
    {candidate && previewContext.date === candidateDate && previewContext.status === "loading" && <div className="surface-muted flex items-center gap-2 px-4 py-3 text-sm text-sage-800"><LoaderCircle size={17} className="animate-spin" />Đang tải lịch và năng lượng của ngày đã chọn…</div>}
    {candidate && previewContext.date === candidateDate && previewContext.status === "unavailable" && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"><div className="flex gap-3"><AlertCircle className="mt-0.5 shrink-0" size={19} /><p>Chưa tải được dữ liệu ngày này nên không thể xem trước trùng lịch hoặc năng lượng. Bạn vẫn có thể lưu hoạt động.</p></div></div>}
    {previewReady && (overlap || (projected !== null && projected < 30)) && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><div className="flex gap-3"><AlertCircle className="mt-0.5 shrink-0" size={19} /><div>{overlap && <p>Lịch này đang chạm một hoạt động khác. Bạn có muốn chừa một khoảng thở không?</p>}{projected !== null && projected < 30 && <p>Năng lượng dự kiến sẽ còn <strong>{projected}%</strong>. Mình có nên nhẹ tay hơn một chút?</p>}{scheduleType === "flexible" && <button type="button" className="mt-2 inline-flex items-center gap-2 font-bold underline" onClick={() => startRef.current?.focus()}><CalendarClock size={16} />Chọn thời gian khác</button>}</div></div></div>}
    {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    <div className="flex justify-end gap-3 border-t border-sage-100 pt-5"><button type="button" disabled={busy} onClick={onCancel} className="button-secondary">Để sau</button><button disabled={busy} className="button-primary">{busy && <LoaderCircle size={17} className="animate-spin" />}{activity ? "Lưu thay đổi" : "Thêm vào lịch"}</button></div>
  </form>;
}
