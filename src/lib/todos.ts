import type { Todo } from "@/lib/types";

export function isTodoOverdue(todo: Todo, todayDate: string, nowIso: string): boolean {
  return todo.status === "pending" && (todo.due_at !== null ? todo.due_at < nowIso : todo.scheduled_date < todayDate);
}
