"use client";

import { BookOpen, BriefcaseBusiness, Check, Clock3, Coffee, Edit3, Ellipsis, LoaderCircle, Repeat2, SkipForward, Trash2, UserRound, Users } from "lucide-react";
import { useState, type ReactNode } from "react";
import { formatTime } from "@/lib/dates";
import { categoryLabels, scheduleLabels, statusLabels, type ActivityCategory, type ForecastActivity } from "@/lib/types";

const categoryIcons: Record<ActivityCategory, ReactNode> = {
  study: <BookOpen size={13} />,
  work: <BriefcaseBusiness size={13} />,
  social: <Users size={13} />,
  personal: <UserRound size={13} />,
  rest: <Coffee size={13} />,
};

export function ActivityCard({ activity, nowIso, pending, onComplete, onEdit, onSkip, onDelete }: { activity: ForecastActivity; nowIso: string; pending: boolean; onComplete: () => void; onEdit: () => void; onSkip: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  const inactive = activity.status === "skipped" || activity.status === "cancelled";
  const past = activity.ends_at < nowIso;
  return <article aria-busy={pending} data-category={activity.category} className={`activity-card surface-interactive ${inactive || past ? "opacity-65" : ""}`}><div className="flex items-start gap-3"><div className="activity-accent" /><button type="button" disabled={pending} onClick={onEdit} className="min-w-0 flex-1 text-left"><div className="flex flex-wrap items-center gap-2 text-xs text-ink-500"><span className="inline-flex items-center gap-1 font-bold"><Clock3 size={13} />{formatTime(activity.starts_at)} – {formatTime(activity.ends_at)}</span><span className="category-chip"><span aria-hidden="true">{categoryIcons[activity.category]}</span>{categoryLabels[activity.category]}</span>{activity.series_id && <Repeat2 size={13} aria-label="Lặp hàng tuần" />}{past && activity.status === "scheduled" && <strong>Đã qua giờ</strong>}</div><h3 className={`mt-1.5 font-bold text-ink-900 ${inactive ? "line-through" : ""}`}>{activity.title}</h3><div className="mt-3 flex flex-wrap items-center gap-2"><span className="rounded-lg bg-cream-100 px-2.5 py-1 text-xs font-bold text-ink-700">{activity.predicted_before} → {activity.predicted_after}%</span><span className="rounded-lg bg-sage-50 px-2.5 py-1 text-xs font-semibold text-sage-800">{scheduleLabels[activity.schedule_type]}</span>{activity.status !== "scheduled" && <span className="text-xs font-bold text-ink-500">{statusLabels[activity.status]}</span>}</div></button><button type="button" disabled={pending} className="icon-button size-9" onClick={() => setMenu((value) => !value)} aria-label={`Thao tác với ${activity.title}`} aria-haspopup="menu" aria-expanded={menu}>{pending ? <LoaderCircle className="animate-spin" size={18} /> : <Ellipsis size={20} />}</button></div>{menu && <div role="menu" className="absolute right-3 top-12 z-10 w-44 rounded-xl border border-sage-200 bg-white p-1.5 shadow-xl">{activity.status === "scheduled" && <button role="menuitem" disabled={pending} className="menu-item" onClick={() => { setMenu(false); onComplete(); }}><Check size={16} />Hoàn thành</button>}<button role="menuitem" disabled={pending} className="menu-item" onClick={() => { setMenu(false); onEdit(); }}><Edit3 size={16} />Chỉnh sửa</button>{activity.status === "scheduled" && <button role="menuitem" disabled={pending} className="menu-item" onClick={() => { setMenu(false); onSkip(); }}><SkipForward size={16} />Nghỉ buổi này</button>}<button role="menuitem" disabled={pending} className="menu-item text-red-700" onClick={() => { setMenu(false); onDelete(); }}><Trash2 size={16} />Xoá</button></div>}</article>;
}
