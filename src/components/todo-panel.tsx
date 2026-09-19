"use client";

import { useState } from "react";
import { CalendarPlus, ChevronDown, ListChecks, Plus, RefreshCw } from "lucide-react";
import { TodoItem } from "@/components/todo-item";
import { dateKey, vietnamDate } from "@/lib/dates";
import { isTodoOverdue } from "@/lib/todos";
import type { Todo } from "@/lib/types";

export type TodoFeatureState = "loading" | "ready" | "unavailable";

interface TodoPanelProps {
  todos: Todo[];
  today: Date;
  featureState: TodoFeatureState;
  featureError: string;
  pendingIds: ReadonlySet<string>;
  onRetry: () => void;
  onOpenForm: (date: string, title?: string) => void;
  onComplete: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onCancel: (todo: Todo) => void;
  onRestore: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
}

export function TodoPanel({ todos, today, featureState, featureError, pendingIds, onRetry, onOpenForm, onComplete, onEdit, onCancel, onRestore, onDelete }: TodoPanelProps) {
  const todayKey = dateKey(today);
  const tomorrowKey = dateKey(new Date(vietnamDate(today).getTime() + 86_400_000));
  const nowIso = today.toISOString();
  const [titles, setTitles] = useState<Record<string, string>>({ [todayKey]: "", [tomorrowKey]: "" });
  const overdue = todos.filter((item) => item.activity_id === null && isTodoOverdue(item, todayKey, nowIso));
  const groups = [
    ...(overdue.length ? [{ title: "Quá hạn", tone: "peach", items: overdue }] : []),
    { title: "Hôm nay", tone: "yellow", date: todayKey, items: todos.filter((item) => item.status === "pending" && (item.activity_id !== null ? item.scheduled_date <= todayKey : item.scheduled_date === todayKey && !isTodoOverdue(item, todayKey, nowIso))) },
    { title: "Ngày mai", tone: "blue", date: tomorrowKey, items: todos.filter((item) => item.status === "pending" && item.scheduled_date === tomorrowKey) },
    ...(() => { const items = todos.filter((item) => item.status === "pending" && item.scheduled_date > tomorrowKey); return items.length ? [{ title: "Sắp tới", tone: "lilac", items }] : []; })(),
  ];
  const done = todos.filter((item) => item.status !== "pending");
  const pendingCount = todos.filter((item) => item.status === "pending").length;

  function advance(date: string) {
    const value = titles[date]?.trim();
    if (!value) return;
    onOpenForm(date, value);
    setTitles((current) => ({ ...current, [date]: "" }));
  }

  if (featureState !== "ready") return <section className="todo-setup-note"><ListChecks size={23} /><div className="min-w-0 flex-1"><h2 className="font-bold text-ink-900">Việc cần làm chưa sẵn sàng</h2><p className="mt-1 text-sm leading-6 text-ink-600">{featureState === "loading" ? "Đang kiểm tra dữ liệu Todo…" : featureError}</p></div><button type="button" disabled={featureState === "loading"} onClick={onRetry} className="button-secondary"><RefreshCw size={16} />Thử lại</button></section>;

  return <div className="space-y-4">
    <header className="flex items-center justify-between gap-3"><div className="flex items-baseline gap-2"><h2 className="text-xl font-bold text-ink-900">Việc cần làm</h2><span className="text-sm font-bold text-ink-400">{pendingCount}</span></div><button type="button" onClick={() => onOpenForm(todayKey)} className="icon-button" aria-label="Thêm việc cho ngày khác" title="Thêm việc cho ngày khác"><CalendarPlus size={17} /></button></header>
    <div className="todo-notes-grid">{groups.map((group) => <section key={group.title} className={`sticky-note sticky-note-${group.tone}`}><div className="sticky-note-tape" aria-hidden="true" /><h3 className="flex items-center justify-between border-b border-black/10 pb-2 font-bold text-ink-900"><span>{group.title}</span><span className="text-xs text-ink-500">{group.items.length}</span></h3>{"date" in group && group.date && <div className="mt-2 flex items-center gap-2 border-b border-black/10 pb-2"><input aria-label={`Thêm việc ${group.title}`} value={titles[group.date] ?? ""} onChange={(event) => setTitles((current) => ({ ...current, [group.date as string]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); advance(group.date as string); } }} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400" placeholder="Ghi nhanh rồi Enter…" /><button type="button" onClick={() => advance(group.date as string)} className="rounded-lg p-1 text-sage-700" aria-label={`Tiếp tục thêm việc ${group.title}`}><Plus size={17} /></button></div>}<div>{group.items.map((todo) => <TodoItem key={todo.id} todo={todo} pending={pendingIds.has(todo.id)} overdue={todo.activity_id === null && isTodoOverdue(todo, todayKey, nowIso)} onComplete={() => onComplete(todo)} onEdit={() => onEdit(todo)} onCancel={() => onCancel(todo)} onRestore={() => onRestore(todo)} onDelete={() => onDelete(todo)} />)}{!group.items.length && <p className="py-5 text-center text-xs text-ink-400">Một khoảng trống nhẹ nhàng</p>}</div></section>)}</div>
    {done.length > 0 && <details className="todo-completed-surface rounded-2xl border px-4 py-3"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-ink-600"><ChevronDown size={16} />Đã xong / đã huỷ <span className="text-ink-400">{done.length}</span></summary><div className="mt-2">{done.map((todo) => <TodoItem key={todo.id} todo={todo} pending={pendingIds.has(todo.id)} overdue={false} onComplete={() => onComplete(todo)} onEdit={() => onEdit(todo)} onCancel={() => onCancel(todo)} onRestore={() => onRestore(todo)} onDelete={() => onDelete(todo)} />)}</div></details>}
  </div>;
}
