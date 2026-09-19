"use client";

import { Bell, BellOff, BellRing, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MascotAvatar } from "@/components/mascot-avatar";
import { formatTime } from "@/lib/dates";
import type { Activity, Todo } from "@/lib/types";

interface ReminderNotice { key: string; title: string; time: string }

type ReminderPermission = NotificationPermission | "unsupported";

function permissionCopy(permission: ReminderPermission): string {
  if (permission === "granted") return "Koboyo đã sẵn sàng nhắc việc";
  if (permission === "denied") return "Thông báo đang bị trình duyệt chặn";
  if (permission === "unsupported") return "Trình duyệt không hỗ trợ thông báo";
  return "Cho Koboyo quyền nhắc việc";
}

function isUpcoming(notice: ReminderNotice, now: number): boolean {
  const eventTime = new Date(notice.time).getTime();
  return Number.isFinite(eventTime) && eventTime > now;
}

export function ReminderCenter({ activities, todos, presentationSuppressed = false }: { activities: Activity[]; todos: Todo[]; presentationSuppressed?: boolean }) {
  const [permission, setPermission] = useState<ReminderPermission>(() => typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const [notices, setNotices] = useState<ReminderNotice[]>([]);
  const toastMemory = useRef(new Set<string>());
  const nativeMemory = useRef(new Set<string>());
  const scan = useCallback(() => {
    const now = Date.now();
    setNotices((current) => {
      const upcoming = current.filter((notice) => isUpcoming(notice, now));
      return upcoming.length === current.length ? current : upcoming;
    });
    if (presentationSuppressed) return;

    const candidates = [
      ...activities.filter((item) => item.status === "scheduled").map((item) => ({ key: `activity:${item.id}:${item.starts_at}`, title: item.title, timestamp: item.starts_at })),
      ...todos.filter((item) => item.activity_id === null && item.status === "pending" && item.due_at).map((item) => ({ key: `todo:${item.id}:${item.due_at}`, title: item.title, timestamp: item.due_at as string })),
    ];
    for (const item of candidates) {
      const eventTime = new Date(item.timestamp).getTime();
      if (!Number.isFinite(eventTime) || now < eventTime - 15 * 60_000 || now > eventTime) continue;
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
          new Notification("Koboyo nhắc bạn: sắp đến giờ", { body: `${item.title} lúc ${formatTime(item.timestamp)}. Mình cùng chuẩn bị nhé!` });
          nativeMemory.current.add(item.key);
          try { sessionStorage.setItem(item.key, "native"); } catch { /* memory fallback */ }
        } catch { /* keep eligible for the next scan */ }
      }
    }
  }, [activities, permission, presentationSuppressed, todos]);

  useEffect(() => {
    const initialScan = window.setTimeout(scan, 0);
    const timer = window.setInterval(scan, 30_000);
    const visible = () => { if (document.visibilityState === "visible") scan(); };
    window.addEventListener("focus", scan);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearTimeout(initialScan);
      window.clearInterval(timer);
      window.removeEventListener("focus", scan);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [scan]);

  useEffect(() => {
    if (notices.length === 0) return;
    const expiries = notices.map((notice) => new Date(notice.time).getTime()).filter(Number.isFinite);
    const nextExpiry = expiries.length > 0 ? Math.min(...expiries) : Date.now();
    const timer = window.setTimeout(() => {
      const now = Date.now();
      setNotices((current) => current.filter((notice) => isUpcoming(notice, now)));
    }, Math.max(0, nextExpiry - Date.now() + 1));
    return () => window.clearTimeout(timer);
  }, [notices]);

  async function enable() {
    if (permission !== "default" || typeof Notification === "undefined") return;
    setPermission(await Notification.requestPermission());
  }

  const label = permissionCopy(permission);
  const blocked = permission === "denied" || permission === "unsupported";
  // Timers can be throttled in a background tab, so render also guards against stale notices.
  // eslint-disable-next-line react-hooks/purity
  const renderNow = Date.now();
  const visibleNotices = notices.filter((notice) => isUpcoming(notice, renderNow));
  const buttonLabel = visibleNotices.length > 0 ? `${label}. ${visibleNotices.length} nhắc việc mới` : label;
  return <>
    <button type="button" data-tour="reminder" onClick={() => void enable()} disabled={permission !== "default"} className={`icon-button ${permission === "granted" ? "icon-button-active" : ""}`} aria-label={buttonLabel} title={label}>
      {permission === "granted" ? <BellRing size={19} /> : blocked ? <BellOff size={19} /> : <Bell size={19} />}
      {visibleNotices.length > 0 && <span className="notification-dot" aria-hidden="true">{visibleNotices.length}</span>}
    </button>
    {!presentationSuppressed && visibleNotices.length > 0 && <div className="reminder-stack fixed bottom-4 right-4 z-40 w-[min(25rem,calc(100vw-2rem))]">
      <MascotAvatar size={72} decorative className="reminder-mascot" />
      <div className="min-w-0 max-h-[calc(100dvh-2rem)] flex-1 space-y-2 overflow-y-auto py-1">{visibleNotices.map((notice) => <div key={notice.key} role="status" className="mascot-speech-bubble reminder-bubble"><div className="flex gap-3"><BellRing className="shrink-0 text-sage-700" size={20} /><div className="min-w-0 flex-1"><p className="text-xs font-bold text-sage-700">Koboyo nhắc · {formatTime(notice.time)}</p><p className="mt-1 break-words font-bold text-ink-900">Sắp đến giờ: {notice.title}</p></div><button type="button" className="icon-button size-8" onClick={() => setNotices((items) => items.filter((item) => item.key !== notice.key))} aria-label="Đóng nhắc việc"><X size={17} /></button></div></div>)}</div>
    </div>}
  </>;
}
