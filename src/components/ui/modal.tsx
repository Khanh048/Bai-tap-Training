"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

const focusableSelector = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function Modal({ open, onClose, title, description, children, size = "md", closeDisabled = false }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; size?: "sm" | "md" | "lg"; closeDisabled?: boolean }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusTimer = window.setTimeout(() => {
      const preferred = dialog?.querySelector<HTMLElement>("[data-modal-autofocus]");
      const first = dialog?.querySelector<HTMLElement>(focusableSelector);
      (preferred ?? first ?? dialog)?.focus();
    }, 0);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !closeDisabled) { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) { event.preventDefault(); dialog.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [closeDisabled, onClose, open]);

  if (!open) return null;
  return <div className="fixed inset-0 z-50 grid items-end bg-ink-900/35 p-0 backdrop-blur-[2px] sm:place-items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (!closeDisabled && event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className={`modal-surface max-h-[94vh] w-full overflow-y-auto rounded-t-[2rem] shadow-2xl sm:rounded-[2rem] ${size === "sm" ? "max-w-md" : size === "lg" ? "max-w-3xl" : "max-w-xl"}`}><header className="modal-header sticky top-0 z-10 flex items-start justify-between border-b px-5 py-5 sm:px-7"><div><h2 id={titleId} className="text-xl font-bold text-ink-900">{title}</h2>{description && <p id={descriptionId} className="mt-1 text-sm text-ink-500">{description}</p>}</div><button type="button" disabled={closeDisabled} onClick={onClose} className="theme-icon-button rounded-xl p-2 text-ink-500 disabled:cursor-wait disabled:opacity-50" aria-label="Đóng hộp thoại"><X size={20} /></button></header><div className="p-5 sm:p-7">{children}</div></section></div>;
}
