"use client";

import { useState } from "react";
import { Ban, CalendarClock, LoaderCircle, Pin } from "lucide-react";
import { MascotAvatar } from "@/components/mascot-avatar";
import { Modal } from "@/components/ui/modal";
import { dateKey, formatTime, parseVietnamDateTime } from "@/lib/dates";
import type { Activity, Todo } from "@/lib/types";

export type OverdueItem = { kind: "activity"; value: Activity } | { kind: "todo"; value: Todo };

export function OverdueDialog({ item, remaining, onReschedule, onCancel, onKeep }: { item: OverdueItem | null; remaining: number; onReschedule: (date: string, time: string) => Promise<void>; onCancel: () => Promise<void>; onKeep: () => Promise<void> }) {
  const value = item?.value;
  const baseIso = item?.kind === "activity" ? item.value.starts_at : item?.value.due_at;
  const [mode, setMode] = useState<"choice" | "reschedule">("choice");
  const [date, setDate] = useState(value ? dateKey(new Date()) : "");
  const [time, setTime] = useState(baseIso ? formatTime(baseIso) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function run(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); setMode("choice"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Chưa thể cập nhật."); } finally { setBusy(false); } }
  async function reschedule(event: React.FormEvent) { event.preventDefault(); if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (time && !parseVietnamDateTime(`${date}T${time}`))) { setError("Ngày giờ chưa hợp lệ."); return; } await run(() => onReschedule(date, time)); }
  return <Modal open={Boolean(item)} onClose={() => undefined} closeDisabled title="Có việc đã qua giờ" description={remaining > 1 ? `Còn ${remaining} mục cần xem` : "Chọn cách xử lý nhẹ nhàng nhất"} size="sm">
    <div className="mascot-dialogue-row mb-5"><MascotAvatar size={76} decorative /><p className="mascot-speech-bubble text-sm">Không sao đâu, mình cùng chọn cách phù hợp cho việc này nhé.</p></div>
    {mode === "choice" ? <div><p className="font-bold text-ink-900">{value?.title}</p><p className="mt-2 text-sm leading-6 text-ink-500">{item?.kind === "activity" ? "Hoạt động đã kết thúc theo lịch." : "Việc cần làm đã qua ngày hoặc giờ hạn."}</p><div className="mt-6 grid gap-2"><button data-modal-autofocus disabled={busy} onClick={() => setMode("reschedule")} className="button-primary"><CalendarClock size={17} />Dời lịch</button><button disabled={busy} onClick={() => void run(onCancel)} className="button-secondary"><Ban size={17} />Huỷ</button><button disabled={busy} onClick={() => void run(onKeep)} className="button-secondary"><Pin size={17} />Giữ lại</button></div>{error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}</div> : <form onSubmit={reschedule} className="space-y-4"><label className="block text-sm font-bold">Ngày mới<input data-modal-autofocus type="date" required value={date} onChange={(event) => setDate(event.target.value)} className="field mt-2" /></label><label className="block text-sm font-bold">Giờ (không bắt buộc)<input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="field mt-2" /></label>{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="flex gap-2"><button type="button" disabled={busy} onClick={() => setMode("choice")} className="button-secondary flex-1">Quay lại</button><button disabled={busy} className="button-primary flex-1">{busy && <LoaderCircle className="animate-spin" size={17} />}Dời lịch</button></div></form>}
  </Modal>;
}
