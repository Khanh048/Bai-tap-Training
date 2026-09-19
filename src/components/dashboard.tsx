"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, HelpCircle, LayoutDashboard, ListChecks, LoaderCircle, LogOut, Menu, Plus, Search, X } from "lucide-react";
import { ActivityForm, type ActivityDateContext } from "@/components/activity-form";
import { Brand, DemoBadge } from "@/components/brand";
import { isOnboardingComplete, OnboardingTour } from "@/components/onboarding-tour";
import { CalendarToolbar } from "@/components/calendar-toolbar";
import { EnergyDialog } from "@/components/energy-dialog";
import { MonthView } from "@/components/month-view";
import { OverdueDialog, type OverdueItem } from "@/components/overdue-dialog";
import { ReminderCenter } from "@/components/reminder-center";
import { ScopeDialog } from "@/components/scope-dialog";
import { TodayView } from "@/components/today-view";
import { TodoForm, type TodoFormDraft } from "@/components/todo-form";
import { TodoPanel, type TodoFeatureState } from "@/components/todo-panel";
import { PopoverSelect } from "@/components/ui/choice-control";
import { Modal } from "@/components/ui/modal";
import { WeekView } from "@/components/week-view";
import { dateKey, dayBounds, formatVietnameseDate, parseVietnamDateTime, shiftAnchor, toDateTimeLocal, viewRange, type CalendarView } from "@/lib/dates";
import { energyBand, forecastActivities, type EnergyBand } from "@/lib/energy";
import { isSupabaseConfigured } from "@/lib/repository";
import { getRepository } from "@/lib/repository-factory";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { activityCategories, activityStatuses, categoryLabels, scheduleLabels, scheduleTypes, statusLabels, type ActionScope, type Activity, type ActivityChanges, type ActivityDraft, type ActivityFilters, type DailyCheckin, type ForecastActivity, type Profile, type Todo, type TodoDraft } from "@/lib/types";

const emptyFilters: ActivityFilters = { query: "", category: "all", scheduleType: "all", status: "all" };
type DashboardView = CalendarView | "todos";

export function Dashboard() {
  const router = useRouter(); const configured = isSupabaseConfigured(); const repository = useMemo(() => getRepository(), []);
  const [currentTime, setCurrentTime] = useState(() => new Date()); const today = currentTime; const todayKey = dateKey(today);
  const [profile, setProfile] = useState<Profile | null>(null); const [checkins, setCheckins] = useState<DailyCheckin[]>([]); const [todayCheckin, setTodayCheckin] = useState<DailyCheckin | null>(null); const [activities, setActivities] = useState<Activity[]>([]); const [reminderActivities, setReminderActivities] = useState<Activity[]>([]); const [todos, setTodos] = useState<Todo[]>([]); const [overdueActivities, setOverdueActivities] = useState<Activity[]>([]); const [overdueTodos, setOverdueTodos] = useState<Todo[]>([]);
  const [view, setView] = useState<DashboardView>("today"); const [anchorDate, setAnchorDate] = useState(() => new Date()); const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true); const [savingCheckin, setSavingCheckin] = useState(false); const [error, setError] = useState(""); const [menuOpen, setMenuOpen] = useState(false); const [todoFeature, setTodoFeature] = useState<TodoFeatureState>("loading"); const [todoFeatureError, setTodoFeatureError] = useState(""); const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false); const [formBusy, setFormBusy] = useState(false); const [editing, setEditing] = useState<Activity | undefined>(); const [defaultStart, setDefaultStart] = useState(""); const [completing, setCompleting] = useState<ForecastActivity | null>(null); const [deleting, setDeleting] = useState<Activity | null>(null);
  const [todoFormOpen, setTodoFormOpen] = useState(false); const [todoFormBusy, setTodoFormBusy] = useState(false); const [editingTodo, setEditingTodo] = useState<Todo | undefined>(); const [todoLinkedActivity, setTodoLinkedActivity] = useState<Activity | null>(null); const [todoInitialTitle, setTodoInitialTitle] = useState(""); const [todoDate, setTodoDate] = useState(todayKey);
  const [pendingActivityIds, setPendingActivityIds] = useState<Set<string>>(() => new Set()); const pendingActivityIdsRef = useRef(new Set<string>()); const [pendingTodoIds, setPendingTodoIds] = useState<Set<string>>(() => new Set()); const pendingTodoIdsRef = useRef(new Set<string>());
  const requestSequence = useRef(0); const timedRequestSequence = useRef(0); const todoOpenSequence = useRef(0); const timedRefreshInFlight = useRef(false); const mountedRef = useRef(false); const currentTimeRef = useRef(currentTime); const viewRef = useRef(view); const anchorDateRef = useRef(anchorDate); const onboardingProfileRef = useRef<string | null>(null); const onboardingTimerRef = useRef<number | null>(null); const calendarView: CalendarView = view === "todos" ? "month" : view; const range = useMemo(() => viewRange(calendarView, anchorDate), [anchorDate, calendarView]);

  const load = useCallback(async (showSpinner = true) => {
    const sequence = ++requestSequence.current; ++timedRequestSequence.current; if (showSpinner) setLoading(true); setError(""); setTodoFeature("loading");
    try {
      if (configured) { const { data } = await getSupabaseBrowserClient().auth.getSession(); if (!data.session) { router.replace("/login"); return; } }
      const fromDate = dateKey(new Date(range.from)); const toDate = dateKey(new Date(range.to)); const nowIso = new Date().toISOString();
      const reminderFrom = new Date(Date.now() - 15 * 60_000).toISOString();
      const reminderTo = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
      const [nextProfile, nextCheckins, currentCheckin, nextActivities, nextReminderActivities] = await Promise.all([
        repository.getProfile(), repository.listCheckins(fromDate, toDate), repository.getCheckin(todayKey), repository.listActivities(range.from, range.to), repository.listActivities(reminderFrom, reminderTo),
      ]);
      if (!mountedRef.current || sequence !== requestSequence.current) return;
      setProfile(nextProfile); setCheckins(nextCheckins); setTodayCheckin(currentCheckin); setActivities(nextActivities); setReminderActivities(nextReminderActivities); setLoading(false);
      if (onboardingProfileRef.current !== nextProfile.id) {
        onboardingProfileRef.current = nextProfile.id;
        if (onboardingTimerRef.current !== null) window.clearTimeout(onboardingTimerRef.current);
        onboardingTimerRef.current = window.setTimeout(() => {
          onboardingTimerRef.current = null;
          if (mountedRef.current && onboardingProfileRef.current === nextProfile.id) setOnboardingOpen(!isOnboardingComplete(nextProfile.id));
        }, 0);
      }
      const [todoResult, overdueActivityResult, overdueTodoResult] = await Promise.allSettled([
        repository.listTodos(), repository.listOverdueActivities(nowIso), repository.listOverdueTodos(todayKey, nowIso),
      ]);
      if (!mountedRef.current || sequence !== requestSequence.current) return;
      if (todoResult.status === "fulfilled") {
        setTodos(todoResult.value); setTodoFeature("ready"); setTodoFeatureError("");
      } else {
        setTodos([]); setOverdueTodos([]); setTodoFeature("unavailable"); setTodoFeatureError(todoUnavailableMessage(todoResult.reason));
      }
      setOverdueActivities(overdueActivityResult.status === "fulfilled" ? overdueActivityResult.value : []);
      if (todoResult.status === "fulfilled") setOverdueTodos(overdueTodoResult.status === "fulfilled" ? overdueTodoResult.value : []);
    } catch (reason) { if (sequence === requestSequence.current) setError(reason instanceof Error ? reason.message : "Chưa thể tải dữ liệu."); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [configured, range.from, range.to, repository, router, todayKey]);

  const refreshTimedData = useCallback(async (now: Date) => {
    if (timedRefreshInFlight.current) return;
    timedRefreshInFlight.current = true;
    const sequence = ++timedRequestSequence.current;
    const nowIso = now.toISOString();
    const reminderFrom = new Date(now.getTime() - 15 * 60_000).toISOString();
    const reminderTo = new Date(now.getTime() + 24 * 60 * 60_000).toISOString();
    try {
      const nextReminderActivities = await repository.listActivities(reminderFrom, reminderTo);
      if (sequence === timedRequestSequence.current) setReminderActivities(nextReminderActivities);
      const [activityResult, todoResult] = await Promise.allSettled([
        repository.listOverdueActivities(nowIso),
        todoFeature === "ready" ? repository.listOverdueTodos(dateKey(now), nowIso) : Promise.resolve<Todo[]>([]),
      ]);
      if (sequence !== timedRequestSequence.current) return;
      if (activityResult.status === "fulfilled") setOverdueActivities(activityResult.value);
      if (todoResult.status === "fulfilled") setOverdueTodos(todoResult.value);
    } catch (reason) {
      if (sequence === timedRequestSequence.current) setError(reason instanceof Error ? reason.message : "Chưa thể làm mới nhắc việc.");
    } finally {
      timedRefreshInFlight.current = false;
    }
  }, [repository, todoFeature]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      ++requestSequence.current;
      ++timedRequestSequence.current;
      if (onboardingTimerRef.current !== null) window.clearTimeout(onboardingTimerRef.current);
    };
  }, []);
  useEffect(() => { viewRef.current = view; anchorDateRef.current = anchorDate; }, [anchorDate, view]);
  useEffect(() => {
    const refreshClock = () => {
      const now = new Date();
      const previous = currentTimeRef.current;
      if (dateKey(previous) !== dateKey(now) && viewRef.current === "today" && dateKey(anchorDateRef.current) === dateKey(previous)) {
        anchorDateRef.current = now;
        setAnchorDate(now);
      }
      currentTimeRef.current = now;
      setCurrentTime(now);
      void refreshTimedData(now);
    };
    const visible = () => { if (document.visibilityState === "visible") refreshClock(); };
    const timer = window.setInterval(refreshClock, 30_000);
    window.addEventListener("focus", refreshClock);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshClock);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refreshTimedData]);

  const nowIso = currentTime.toISOString();
  const visible = useMemo(() => activities.filter((item) => item.title.toLocaleLowerCase("vi").includes(filters.query.toLocaleLowerCase("vi").trim()) && (filters.category === "all" || item.category === filters.category) && (filters.scheduleType === "all" || item.schedule_type === filters.scheduleType) && (filters.status === "all" || item.status === filters.status)), [activities, filters]);
  const visibleIds = useMemo(() => new Set(visible.map((item) => item.id)), [visible]);
  const anchorKey = dateKey(anchorDate); const anchorActivities = activities.filter((item) => dateKey(new Date(item.starts_at)) === anchorKey); const anchorCheckin = checkins.find((item) => item.checkin_date === anchorKey) ?? (anchorKey === todayKey ? todayCheckin : null); const defaultEnergy = profile?.default_energy ?? 70;
  const filtersActive = filters.category !== "all" || filters.scheduleType !== "all" || filters.status !== "all"; const formDate = editing ? dateKey(new Date(editing.starts_at)) : defaultStart.slice(0, 10); const formInitialEnergy = checkins.find((item) => item.checkin_date === formDate)?.energy_level ?? (formDate === todayKey ? todayCheckin?.energy_level : undefined) ?? defaultEnergy; const formInitialContextAvailable = Boolean(formDate && formDate >= dateKey(new Date(range.from)) && formDate <= dateKey(new Date(range.to)));
  const overdueQueue: OverdueItem[] = [...overdueActivities.map((value): OverdueItem => ({ kind: "activity", value })), ...overdueTodos.map((value): OverdueItem => ({ kind: "todo", value }))]; const overdueItem = !loading && !onboardingOpen ? overdueQueue[0] ?? null : null;
  const batteryText = todayCheckin ? `Pin hiện tại ${todayCheckin.energy_level}%` : "Chưa check-in hôm nay"; const batteryBand = todayCheckin ? energyBand(todayCheckin.energy_level) : null; const batteryStatus = batteryBand ? energyStatus(batteryBand) : "";
  const batteryTone = batteryBand === null ? "text-ink-500" : batteryBand === "low" ? "text-red-700" : batteryBand === "medium" ? "text-amber-800" : "text-sage-700";

  const loadActivityDateContext = useCallback(async (date: string): Promise<ActivityDateContext> => {
    const candidateDate = parseVietnamDateTime(`${date}T12:00`);
    if (!candidateDate) throw new Error("Ngày đã chọn chưa hợp lệ.");
    const bounds = dayBounds(candidateDate);
    const [checkin, candidateActivities] = await Promise.all([
      repository.getCheckin(date),
      repository.listActivities(bounds.from, bounds.to),
    ]);
    return { activities: candidateActivities, initialEnergy: checkin?.energy_level ?? profile?.default_energy ?? 70 };
  }, [profile?.default_energy, repository]);

  function openCreate(date = anchorDate, forceNine = false) { const key = dateKey(date); const nine = `${key}T09:00`; const localNow = toDateTimeLocal(new Date().toISOString()); setDefaultStart(!forceNine && key === todayKey && localNow > nine ? localNow : nine); setEditing(undefined); setFormBusy(false); setFormOpen(true); }
  function openEdit(activity: Activity) { setEditing(activity); setDefaultStart(toDateTimeLocal(activity.starts_at)); setFormBusy(false); setFormOpen(true); }
  async function openTodo(date: string, todo?: Todo, initialTitle = "") {
    const sequence = ++todoOpenSequence.current;
    if (todo && todo.activity_id === null && todo.status !== "pending") { setError("Hãy khôi phục Todo cũ trước khi chỉnh và thêm vào lịch năng lượng."); return; }
    try {
      const linkedActivity = todo?.activity_id ? await repository.getActivity(todo.activity_id) : null;
      if (sequence !== todoOpenSequence.current) return;
      setTodoDate(todo?.scheduled_date ?? date); setEditingTodo(todo); setTodoInitialTitle(initialTitle); setTodoFormBusy(false); setTodoLinkedActivity(linkedActivity); setTodoFormOpen(true);
    } catch (reason) {
      if (sequence === todoOpenSequence.current) setError(reason instanceof Error ? reason.message : "Chưa thể mở Todo này.");
    }
  }
  async function reloadAfterMutation() { ++timedRequestSequence.current; await load(false); }
  async function linkedTodoFor(activityId: string): Promise<Todo | null> {
    if (todoFeature === "unavailable" && /migrations 002/.test(todoFeatureError)) return null;
    return repository.getTodoByActivity(activityId);
  }
  async function restoreActivity(activity: Activity): Promise<void> {
    await repository.updateActivity(activity, { title: activity.title, category: activity.category, schedule_type: activity.schedule_type, starts_at: activity.starts_at, ends_at: activity.ends_at, expected_impact: activity.expected_impact, actual_energy_after: activity.actual_energy_after, status: activity.status, note: activity.note, recurrence: activity.recurrence, recurrence_end_date: activity.recurrence_end_date, overdue_acknowledged_at: activity.overdue_acknowledged_at }, "single");
  }
  async function saveActivity(draft: ActivityDraft, scope: ActionScope) {
    if (editing) {
      const linkedTodo = await linkedTodoFor(editing.id);
      const savedDraft: ActivityDraft = linkedTodo
        ? { ...draft, schedule_type: "flexible", recurrence: "none", recurrence_end_date: null }
        : draft;
      const activityChanges: ActivityChanges = {
        title: savedDraft.title, category: savedDraft.category, schedule_type: savedDraft.schedule_type,
        starts_at: savedDraft.starts_at, ends_at: savedDraft.ends_at, expected_impact: savedDraft.expected_impact,
        note: savedDraft.note, recurrence: savedDraft.recurrence, overdue_acknowledged_at: null,
        ...(editing.series_id && scope === "single" ? {} : { recurrence_end_date: savedDraft.recurrence_end_date }),
      };
      if (linkedTodo) {
        await repository.updateTodo(linkedTodo, { title: savedDraft.title, scheduled_date: dateKey(new Date(savedDraft.starts_at)), due_at: savedDraft.starts_at, note: savedDraft.note, overdue_acknowledged_at: null });
        try { await repository.updateActivity(editing, activityChanges, "single"); }
        catch (reason) {
          try { await repository.updateTodo(linkedTodo, { title: linkedTodo.title, scheduled_date: linkedTodo.scheduled_date, due_at: linkedTodo.due_at, note: linkedTodo.note, overdue_acknowledged_at: linkedTodo.overdue_acknowledged_at }); }
          catch (rollbackReason) { throw new Error(`Không thể lưu Activity và cũng chưa thể khôi phục Todo: ${rollbackReason instanceof Error ? rollbackReason.message : "lỗi không xác định"}`); }
          throw reason;
        }
      } else await repository.updateActivity(editing, activityChanges, scope);
    } else await repository.createActivity(draft);
    setFormBusy(false); setFormOpen(false); setEditing(undefined); await reloadAfterMutation();
  }
  async function updateActivity(activity: Activity, changes: ActivityChanges) {
    const linkedTodo = await linkedTodoFor(activity.id);
    await repository.updateActivity(activity, changes, "single");
    if (linkedTodo) {
      const status = changes.status === "completed" ? "completed" : changes.status === "scheduled" ? "pending" : changes.status === "cancelled" || changes.status === "skipped" ? "cancelled" : undefined;
      try {
        await repository.updateTodo(linkedTodo, {
          ...(changes.title !== undefined ? { title: changes.title } : {}),
          ...(changes.starts_at !== undefined ? { scheduled_date: dateKey(new Date(changes.starts_at)), due_at: changes.starts_at } : {}),
          ...(changes.note !== undefined ? { note: changes.note } : {}),
          ...(status ? { status } : {}),
        });
      } catch (reason) { await restoreActivity(activity); throw reason; }
    }
    await reloadAfterMutation();
  }
  function runActivity(activity: Activity, action: () => Promise<void>, fallback: string) { if (pendingActivityIdsRef.current.has(activity.id)) return; const next = new Set(pendingActivityIdsRef.current); next.add(activity.id); pendingActivityIdsRef.current = next; setPendingActivityIds(next); void action().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : fallback)).finally(() => { const remaining = new Set(pendingActivityIdsRef.current); remaining.delete(activity.id); pendingActivityIdsRef.current = remaining; setPendingActivityIds(remaining); }); }
  function skipActivity(activity: Activity) { runActivity(activity, () => updateActivity(activity, { status: "skipped" }), "Chưa thể nghỉ buổi này."); }
  async function saveCheckin(energy: number, note: string) { setSavingCheckin(true); try { const saved = await repository.saveCheckin(anchorKey, energy, note); setCheckins((items) => [...items.filter((item) => item.checkin_date !== saved.checkin_date), saved]); if (anchorKey === todayKey) setTodayCheckin(saved); } catch (reason) { setError(reason instanceof Error ? reason.message : "Chưa thể lưu check-in."); } finally { setSavingCheckin(false); } }
  async function saveTodo(draft: TodoFormDraft) {
    const activityDraft: ActivityDraft = { title: draft.title, category: "personal", schedule_type: "flexible", starts_at: draft.starts_at, ends_at: draft.ends_at, expected_impact: draft.expected_impact, note: draft.note, recurrence: "none", recurrence_end_date: null };
    let activity = todoLinkedActivity;
    let createdActivity: Activity | null = null;
    if (activity) await repository.updateActivity(activity, { title: draft.title, category: "personal", schedule_type: "flexible", starts_at: draft.starts_at, ends_at: draft.ends_at, expected_impact: draft.expected_impact, note: draft.note, overdue_acknowledged_at: null }, "single");
    else {
      const created = await repository.createActivity(activityDraft);
      activity = created[0] ?? null; createdActivity = activity;
      if (!activity) throw new Error("Chưa thể tạo khoảng lịch cho việc này.");
    }
    try {
      const todoDraft: TodoDraft = { title: draft.title, scheduled_date: draft.scheduled_date, due_at: draft.starts_at, note: draft.note, activity_id: activity.id };
      if (editingTodo) await repository.updateTodo(editingTodo, { ...todoDraft, overdue_acknowledged_at: null });
      else await repository.createTodo(todoDraft);
    } catch (reason) {
      if (createdActivity) {
        try { await repository.deleteActivity(createdActivity, "single"); }
        catch (rollbackReason) { throw new Error(`Không thể lưu Todo và cũng chưa thể dọn Activity vừa tạo: ${rollbackReason instanceof Error ? rollbackReason.message : "lỗi không xác định"}`); }
      } else if (activity) await restoreActivity(activity);
      throw reason;
    }
    setTodoFormOpen(false); setEditingTodo(undefined); setTodoLinkedActivity(null); await reloadAfterMutation();
  }
  function runTodo(todo: Todo, action: () => Promise<void>, fallback: string) { if (pendingTodoIdsRef.current.has(todo.id)) return; const next = new Set(pendingTodoIdsRef.current); next.add(todo.id); pendingTodoIdsRef.current = next; setPendingTodoIds(next); void action().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : fallback)).finally(() => { const remaining = new Set(pendingTodoIdsRef.current); remaining.delete(todo.id); pendingTodoIdsRef.current = remaining; setPendingTodoIds(remaining); }); }
  function changeTodoStatus(todo: Todo, status: "pending" | "cancelled") { runTodo(todo, async () => {
    const activity = todo.activity_id ? await repository.getActivity(todo.activity_id) : null;
    if (activity) await repository.updateActivity(activity, { status: status === "pending" ? "scheduled" : "cancelled", actual_energy_after: null }, "single");
    try { await repository.updateTodo(todo, { status }); }
    catch (reason) { if (activity) await restoreActivity(activity); throw reason; }
    await reloadAfterMutation();
  }, "Chưa thể cập nhật việc cần làm."); }
  function completeTodo(todo: Todo) { runTodo(todo, async () => {
    if (!todo.activity_id) { await repository.updateTodo(todo, { status: "completed" }); await reloadAfterMutation(); return; }
    const activity = await repository.getActivity(todo.activity_id);
    if (!activity) { await repository.updateTodo(todo, { status: "completed", activity_id: null }); await reloadAfterMutation(); return; }
    const context = await loadActivityDateContext(dateKey(new Date(activity.starts_at)));
    const forecast = forecastActivities(context.activities, context.initialEnergy).find((item) => item.id === activity.id);
    setCompleting(forecast ?? { ...activity, predicted_before: context.initialEnergy, predicted_after: Math.max(0, Math.min(100, context.initialEnergy + activity.expected_impact)) });
  }, "Chưa thể chuẩn bị xác nhận năng lượng."); }
  function deleteTodo(todo: Todo) { runTodo(todo, async () => { const activity = todo.activity_id ? await repository.getActivity(todo.activity_id) : null; if (activity) await repository.deleteLinkedTodo(todo, activity, "single"); else await repository.deleteTodo(todo); await reloadAfterMutation(); }, "Chưa thể xoá việc."); }
  async function deleteActivityAndLinked(activity: Activity, scope: ActionScope) { const linkedTodo = await linkedTodoFor(activity.id); if (linkedTodo) await repository.deleteLinkedTodo(linkedTodo, activity, scope); else await repository.deleteActivity(activity, scope); await reloadAfterMutation(); }
  async function handleOverdueReschedule(date: string, time: string) {
    if (!overdueItem) return;
    if (overdueItem.kind === "todo") {
      const dueDate = time ? parseVietnamDateTime(`${date}T${time}`) : null;
      if (time && (!dueDate || dueDate.getTime() <= Date.now())) throw new Error("Hãy chọn giờ hạn ở tương lai.");
      if (!time && date < todayKey) throw new Error("Hãy chọn hôm nay hoặc một ngày sắp tới.");
      await repository.updateTodo(overdueItem.value, { scheduled_date: date, due_at: dueDate?.toISOString() ?? null, status: "pending", overdue_acknowledged_at: null });
      await reloadAfterMutation(); return;
    }
    const activity = overdueItem.value; const duration = new Date(activity.ends_at).getTime() - new Date(activity.starts_at).getTime(); const fallbackTime = toDateTimeLocal(activity.starts_at).slice(11, 16); const start = parseVietnamDateTime(`${date}T${time || fallbackTime}`);
    if (!start) throw new Error("Ngày giờ mới chưa hợp lệ.");
    const end = new Date(start.getTime() + duration);
    if (end.getTime() <= Date.now()) throw new Error("Hãy dời hoạt động đến thời điểm chưa kết thúc.");
    await updateActivity(activity, { starts_at: start.toISOString(), ends_at: end.toISOString(), status: "scheduled", overdue_acknowledged_at: null });
  }
  async function handleOverdueCancel() {
    if (!overdueItem) return;
    if (overdueItem.kind === "todo") { await repository.updateTodo(overdueItem.value, { status: "cancelled" }); await reloadAfterMutation(); return; }
    await updateActivity(overdueItem.value, { status: "cancelled" });
  }
  async function handleOverdueKeep() { if (!overdueItem) return; const acknowledged = new Date().toISOString(); if (overdueItem.kind === "todo") await repository.updateTodo(overdueItem.value, { overdue_acknowledged_at: acknowledged }); else await repository.updateActivity(overdueItem.value, { overdue_acknowledged_at: acknowledged }, "single"); await reloadAfterMutation(); }
  async function signOut() { if (configured) await getSupabaseBrowserClient().auth.signOut(); router.push(configured ? "/login" : "/"); router.refresh(); }

  if (loading) return <div className="grid min-h-screen place-items-center bg-cream-50"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-sage-700" size={32} /><p className="mt-4 text-sm font-semibold text-ink-600">Đang lắng nghe nhịp ngày của bạn…</p></div></div>;
  return <div className="dashboard-shell min-h-screen"><aside className={`fixed inset-y-0 left-0 z-40 flex h-dvh w-72 flex-col overflow-y-auto border-r border-sage-200 bg-white p-5 transition-transform lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}><div className="flex items-center justify-between"><Brand compact /><button className="rounded-xl p-2 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Đóng menu"><X size={20} /></button></div><nav className="mt-10 space-y-2"><button onClick={() => { setView("today"); setAnchorDate(today); setMenuOpen(false); }} className={`sidebar-link ${view === "today" && anchorKey === todayKey ? "sidebar-link-active" : ""}`}><LayoutDashboard size={19} />Hôm nay</button><button onClick={() => { setView("month"); setMenuOpen(false); }} className={`sidebar-link ${view === "month" ? "sidebar-link-active" : ""}`}><CalendarDays size={19} />Lịch</button><button data-tour="todo-nav" onClick={() => { setView("todos"); setMenuOpen(false); }} className={`sidebar-link ${view === "todos" ? "sidebar-link-active" : ""}`}><ListChecks size={19} />Việc cần làm</button></nav><div className="mt-auto space-y-3 pt-6"><div className="rounded-2xl bg-sage-50 p-4"><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl bg-sage-700 font-bold text-white">{profile?.display_name.charAt(0).toUpperCase() ?? "B"}</span><div className="min-w-0"><p className="truncate text-sm font-bold text-ink-900">{profile?.display_name ?? "Bạn"}</p><p className={`text-xs font-bold ${batteryTone}`}>{batteryText}</p>{batteryStatus && <p className="text-xs text-ink-500">{batteryStatus}</p>}</div></div></div><button onClick={() => void signOut()} className="sidebar-link"><LogOut size={18} />{configured ? "Đăng xuất" : "Về trang chủ"}</button></div></aside>{menuOpen && <button className="fixed inset-0 z-30 bg-ink-900/30 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Đóng menu" />}<div className="lg:pl-72"><header className="header-shell sticky top-0 z-20 border-b border-sage-200/80 px-4 py-4 backdrop-blur sm:px-7"><div className="mx-auto flex max-w-7xl items-center gap-3"><button data-tour="mobile-menu" onClick={() => setMenuOpen(true)} className="rounded-xl border border-sage-200 bg-white p-2.5 lg:hidden" aria-label="Mở menu"><Menu size={20} /></button><div className="min-w-0 flex-1"><p className="truncate text-lg font-bold text-ink-900">Chào {profile?.display_name ?? "bạn"}, hôm nay mình vừa sức nhé!</p><p className="hidden text-sm capitalize text-ink-500 sm:block">{formatVietnameseDate(today)}</p></div>{!configured && <DemoBadge />}<div data-tour="header-actions" className="flex shrink-0 items-center gap-2"><button type="button" className="icon-button" onClick={() => setOnboardingOpen(true)} aria-label="Xem lại hướng dẫn sử dụng" title="Hướng dẫn sử dụng"><HelpCircle size={19} /></button><ReminderCenter activities={reminderActivities} todos={todos} /><button onClick={() => openCreate(today)} className="button-primary hidden sm:inline-flex"><Plus size={18} />Thêm hoạt động</button></div></div></header><main className="mx-auto max-w-7xl px-4 py-6 sm:px-7 sm:py-8">{error && <div role="alert" className="mb-5 flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button onClick={() => void load()} className="font-bold underline">Thử lại</button></div>}{view === "todos" ? <TodoPanel key={todayKey} todos={todos} today={today} featureState={todoFeature} featureError={todoFeatureError} pendingIds={pendingTodoIds} onRetry={() => void load(false)} onOpenForm={(date, title) => void openTodo(date, undefined, title)} onComplete={completeTodo} onEdit={(todo) => void openTodo(todo.scheduled_date, todo)} onCancel={(todo) => changeTodoStatus(todo, "cancelled")} onRestore={(todo) => changeTodoStatus(todo, "pending")} onDelete={deleteTodo} /> : <><CalendarToolbar view={view} anchor={anchorDate} onViewChange={setView} onAnchorChange={(direction) => setAnchorDate((current) => shiftAnchor(current, view, direction))} onAnchorSelect={setAnchorDate} onToday={() => setAnchorDate(today)} /><div className="mb-5 flex flex-col gap-3"><div className="flex flex-col gap-2 xl:flex-row"><label className="relative flex-1"><span className="sr-only">Tìm hoạt động</span><Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" size={18} /><input value={filters.query} onChange={(event) => setFilters((value) => ({ ...value, query: event.target.value }))} className="field pl-10" placeholder="Tìm theo tên hoạt động…" /></label><div className="grid grid-cols-3 gap-2"><FilterSelect label="Kiểu lịch" value={filters.scheduleType} onChange={(value) => setFilters((current) => ({ ...current, scheduleType: value as ActivityFilters["scheduleType"] }))} options={scheduleTypes.map((item) => [item, scheduleLabels[item]])} /><FilterSelect label="Nhóm" value={filters.category} onChange={(value) => setFilters((current) => ({ ...current, category: value as ActivityFilters["category"] }))} options={activityCategories.map((item) => [item, categoryLabels[item]])} /><FilterSelect label="Trạng thái" value={filters.status} onChange={(value) => setFilters((current) => ({ ...current, status: value as ActivityFilters["status"] }))} options={activityStatuses.map((item) => [item, statusLabels[item]])} /></div></div><div className="flex flex-wrap items-center gap-4">{filtersActive && <button onClick={() => setFilters((value) => ({ ...emptyFilters, query: value.query }))} className="text-xs font-bold text-sage-700 underline">Xoá bộ lọc</button>}</div></div>{view === "today" ? <TodayView activities={anchorActivities} visibleActivityIds={visibleIds} pendingActivityIds={pendingActivityIds} checkin={anchorCheckin} defaultEnergy={defaultEnergy} nowIso={nowIso} savingCheckin={savingCheckin} onSaveCheckin={saveCheckin} onAdd={() => openCreate(anchorDate)} onComplete={setCompleting} onEdit={openEdit} onSkip={skipActivity} onDelete={setDeleting} /> : view === "week" ? <WeekView anchor={anchorDate} activities={activities} visibleActivityIds={visibleIds} pendingActivityIds={pendingActivityIds} checkins={checkins} defaultEnergy={defaultEnergy} now={currentTime} onAdd={openCreate} onComplete={setCompleting} onEdit={openEdit} onSkip={skipActivity} onDelete={setDeleting} /> : <MonthView anchor={anchorDate} activities={activities} visibleActivityIds={visibleIds} checkins={checkins} defaultEnergy={defaultEnergy} now={currentTime} onAdd={(date) => openCreate(date, true)} onEdit={openEdit} />}</>}</main></div>{profile && <OnboardingTour key={profile.id} open={onboardingOpen} profileId={profile.id} onClose={() => setOnboardingOpen(false)} />}<Modal open={formOpen} onClose={() => setFormOpen(false)} closeDisabled={formBusy} title={editing ? "Chỉnh lại hoạt động" : "Thêm một hoạt động"} description="Sắp lịch theo nhịp năng lượng của bạn" size="lg">{formOpen && <ActivityForm activity={editing} activities={activities} initialEnergy={formInitialEnergy} initialContextAvailable={formInitialContextAvailable} defaultStart={defaultStart} onCancel={() => setFormOpen(false)} onBusyChange={setFormBusy} onLoadDateContext={loadActivityDateContext} onSave={saveActivity} />}</Modal><Modal open={todoFormOpen} onClose={() => setTodoFormOpen(false)} closeDisabled={todoFormBusy} title={editingTodo ? "Chỉnh việc cần làm" : "Thêm việc cần làm"} description="Việc nhỏ, ngày rõ ràng"><TodoForm todo={editingTodo} linkedActivity={todoLinkedActivity} initialTitle={todoInitialTitle} defaultDate={todoDate} onCancel={() => setTodoFormOpen(false)} onBusyChange={setTodoFormBusy} onLoadDateContext={loadActivityDateContext} onSave={saveTodo} /></Modal><EnergyDialog key={completing?.id ?? "energy-closed"} activity={completing} onClose={() => setCompleting(null)} onSave={async (energy) => { if (completing) await updateActivity(completing, { status: "completed", actual_energy_after: energy }); setCompleting(null); }} /><ScopeDialog key={deleting?.id ?? "scope-closed"} activity={deleting} onClose={() => setDeleting(null)} onConfirm={async (scope) => { if (!deleting) return; await deleteActivityAndLinked(deleting, scope); setDeleting(null); }} /><OverdueDialog key={overdueItem ? `${overdueItem.kind}-${overdueItem.value.id}` : "overdue-closed"} item={overdueItem} remaining={overdueQueue.length} onReschedule={handleOverdueReschedule} onCancel={handleOverdueCancel} onKeep={handleOverdueKeep} /></div>;
}

function energyStatus(band: EnergyBand): string { return band === "low" ? "Nên ưu tiên hồi pin" : band === "medium" ? "Cần đi chậm" : "Năng lượng đang ổn"; }
function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <PopoverSelect label={label} value={value} onChange={onChange} options={[
    { value: "all", label: "Tất cả" },
    ...options.map(([optionValue, optionLabel]) => ({ value: optionValue, label: optionLabel })),
  ]} />;
}

function todoUnavailableMessage(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : "Không xác định được lỗi dữ liệu Todo.";
  if (/PGRST|schema cache|relation .*todos|column .*activity_id|overdue_acknowledged_at|does not exist|could not find/i.test(message)) {
    return "Todo chưa được thiết lập đủ. Hãy chạy migrations 002 → 003 → 004 trên Supabase rồi thử lại.";
  }
  if (/phiên đăng nhập|JWT|auth/i.test(message)) return message;
  if (/row-level security|permission|policy|RLS/i.test(message)) return `Todo bị chặn bởi quyền truy cập: ${message}`;
  if (/fetch|network|kết nối|timeout/i.test(message)) return "Chưa thể kết nối để tải Todo. Hãy kiểm tra mạng rồi thử lại.";
  return `Todo tạm thời chưa dùng được: ${message}`;
}
