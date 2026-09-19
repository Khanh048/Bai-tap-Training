"use client";

import { Bell, BellOff, BellRing, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/dates";
import type { Activity, Todo } from "@/lib/types";

interface ReminderNotice { key: string; title: string; time: string }

type ReminderPermission = NotificationPermission | "unsupported";

function permissionCopy(permission: ReminderPermission): string {
  if (permission === "granted") return "Thông báo trình duyệt đã bật";
  if (permission === "denied") return "Thông báo đang bị trình duyệt chặn";
  if (permission === "unsupported") return "Trình duyệt không hỗ trợ thông báo";
  return "Bật thông báo nhắc việc";
}

export function ReminderCenter({ activities, todos }: { activities: Activity[]; todos: Todo[] }) {
  const [permission, setPermission] = useState<ReminderPermission>(() => typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const [notices, setNotices] = useState<ReminderNotice[]>([]);
  const toastMemory = useRef(new Set<string>());
  const nativeMemory = useRef(new Set<string>());
  const scan = useCallback(() => {
    const now = Date.now();
    const candidates = [
      ...activities.filter((item) => item.status === "scheduled").map((item) => ({ key: `activity:${item.id}:${item.starts_at}`, title: item.title, timestamp: item.starts_at })),
      ...todos.filter((item) => item.activity_id === null && item.status === "pending" && item.due_at).map((item) => ({ key: `todo:${item.id}:${item.due_at}`, title: item.title, timestamp: item.due_at as string })),
    ];
    for (const item of candidates) {
      const eventTime = new Date(item.timestamp).getTime();
      if (now < eventTime - 15 * 60_000 || now > eventTime) continue;
      let stored = "";
      try { stored = sessionStorage.getItem(item.key) ?? ""; } catch { /* memory fallback */ }
      const toastShown = toastMemory.current.has(item.key) || stored === "toast" || stored === "native" || stored === "1";
      const nativeShown = nativeMemory.current.has(item.key) || stored === "native" || stored === "1";
      if (!toastShown) {
        toastMemory.current.add(item.key);
        setNotices((current) => current.some((notice) => notice.key === item.key) ? current : [...current, { key: item.key, title: item.title, time: item.timestamp }]);
        try { sessionStorage.setItem(item.key, "toast"); } catch { /* memory fallback */ }
      }
      if (permission === "granted" && !nativeShown) {
        try {
          new Notification("Sắp đến giờ", { body: `${item.title} · ${formatTime(item.timestamp)}` });
          nativeMemory.current.add(item.key);
          try { sessionStorage.setItem(item.key, "native"); } catch { /* memory fallback */ }
        } catch { /* keep eligible for the next scan */ }
      }
    }
  }, [activities, permission, todos]);

  useEffect(() => {
    scan();
    const timer = window.setInterval(scan, 30_000);
    const visible = () => { if (document.visibilityState === "visible") scan(); };
    window.addEventListener("focus", scan);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", scan);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [scan]);

  async function enable() {
    if (permission !== "default" || typeof Notification === "undefined") return;
    setPermission(await Notification.requestPermission());
  }

  const label = permissionCopy(permission);
  const blocked = permission === "denied" || permission === "unsupported";
  return <>
    <button type="button" data-tour="reminder" onClick={() => void enable()} disabled={permission !== "default"} className={`icon-button ${permission === "granted" ? "icon-button-active" : ""}`} aria-label={label} title={label}>
      {permission === "granted" ? <BellRing size={19} /> : blocked ? <BellOff size={19} /> : <Bell size={19} />}
      {notices.length > 0 && <span className="notification-dot" aria-label={`${notices.length} nhắc việc mới`}>{notices.length}</span>}
    </button>
    <div className="fixed bottom-4 right-4 z-[60] w-[min(22rem,calc(100vw-2rem))] space-y-2">{notices.map((notice) => <div key={notice.key} role="status" className="surface-card p-4 shadow-xl"><div className="flex gap-3"><BellRing className="shrink-0 text-sage-700" size={20} /><div className="min-w-0 flex-1"><p className="text-xs font-bold text-sage-700">Sắp đến giờ · {formatTime(notice.time)}</p><p className="mt-1 truncate font-bold text-ink-900">{notice.title}</p></div><button type="button" className="icon-button size-8" onClick={() => setNotices((items) => items.filter((item) => item.key !== notice.key))} aria-label="Đóng nhắc việc"><X size={17} /></button></div></div>)}</div>
  </>;
}
