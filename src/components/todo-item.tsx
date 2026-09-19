"use client";

import { Ban, Check, Ellipsis, LoaderCircle, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/dates";
import { todoStatusLabels, type Todo } from "@/lib/types";

interface TodoItemProps {
  todo: Todo;
  pending: boolean;
  overdue: boolean;
  onComplete: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onRestore: () => void;
  onDelete: () => void;
}

export function TodoItem({ todo, pending, overdue, onComplete, onEdit, onCancel, onRestore, onDelete }: TodoItemProps) {
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRoot = useRef<HTMLDivElement>(null);
  const checked = todo.status === "completed";
  const inactive = todo.status !== "pending";

  useEffect(() => {
    if (!menu) return;
    const close = () => { setMenu(false); setConfirmDelete(false); };
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRoot.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  return <div aria-busy={pending} className="todo-row">
    <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
      <input type="checkbox" checked={checked} disabled={pending || inactive} onChange={onComplete} className="peer size-5 appearance-none rounded border border-ink-400 bg-white checked:border-sage-700 checked:bg-sage-700" aria-label={`Hoàn thành ${todo.title}`} />
      {checked && <Check className="pointer-events-none absolute text-white" size={13} strokeWidth={3} />}
      {pending && <LoaderCircle className="pointer-events-none absolute animate-spin text-sage-700" size={14} />}
    </span>
    <button type="button" disabled={pending} onClick={onEdit} className="min-w-0 flex-1 text-left">
      <span className={`block text-sm font-bold text-ink-900 ${inactive ? "text-ink-500 line-through" : ""}`}>{todo.title}</span>
      {(todo.due_at || todo.note || overdue || inactive) && <span className="mt-0.5 block truncate text-xs text-ink-500">{todo.due_at && `${formatTime(todo.due_at)} · `}{overdue ? "Quá hạn" : inactive ? todoStatusLabels[todo.status] : todo.note}</span>}
    </button>
    <div ref={menuRoot} className="relative shrink-0">
      <button type="button" disabled={pending} onClick={() => { setMenu((value) => !value); setConfirmDelete(false); }} className="rounded-lg p-1 text-ink-500 hover:bg-black/5" aria-label={`Thao tác với ${todo.title}`} aria-haspopup="menu" aria-expanded={menu}>{pending ? <LoaderCircle className="animate-spin" size={16} /> : <Ellipsis size={18} />}</button>
      {menu && <div role="menu" className="todo-menu absolute right-0 top-8 z-20 w-44 rounded-xl border p-1.5 shadow-xl">
        <button role="menuitem" className="menu-item" onClick={() => { setMenu(false); onEdit(); }}><Pencil size={15} />Chỉnh sửa</button>
        {todo.status === "pending" ? <button role="menuitem" className="menu-item" onClick={() => { setMenu(false); onCancel(); }}><Ban size={15} />Huỷ</button> : <button role="menuitem" className="menu-item" onClick={() => { setMenu(false); onRestore(); }}><RotateCcw size={15} />Khôi phục</button>}
        <button role="menuitem" className="menu-item text-red-700" onClick={() => { if (confirmDelete) { setMenu(false); onDelete(); } else setConfirmDelete(true); }}><Trash2 size={15} />{confirmDelete ? "Xác nhận xoá" : "Xoá"}</button>
      </div>}
    </div>
  </div>;
}
