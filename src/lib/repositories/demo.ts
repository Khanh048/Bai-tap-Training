import { addWeeks } from "date-fns";
import { dateKey, parseVietnamDateTime } from "@/lib/dates";
import { compareActivitiesByImpactTime } from "@/lib/energy";
import type { EnergyRepository } from "@/lib/repository";
import {
  activityCategories,
  activityStatuses,
  recurrenceTypes,
  scheduleTypes,
  todoStatuses,
  type ActionScope,
  type Activity,
  type ActivityChanges,
  type ActivityDraft,
  type DailyCheckin,
  type Profile,
  type Todo,
  type TodoChanges,
  type TodoDraft,
} from "@/lib/types";

const STORAGE_KEY = "hom-nay-the-nao-demo-v1";
const USER_ID = "demo-user";

interface DemoData {
  profile: Profile;
  checkins: DailyCheckin[];
  activities: Activity[];
  todos: Todo[];
}

let memoryData: DemoData | null = null;
let useMemoryStorage = false;

function id(): string {
  return crypto.randomUUID();
}

function initialData(): DemoData {
  const now = new Date();
  const at = (hour: number, minute = 0) => {
    const value = `${dateKey(now)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    return (parseVietnamDateTime(value) ?? now).toISOString();
  };
  const timestamp = now.toISOString();
  return {
    profile: { id: USER_ID, display_name: "An", default_energy: 70 },
    checkins: [],
    activities: [
      { id: id(), user_id: USER_ID, title: "Tập trung làm việc", category: "work", schedule_type: "fixed", starts_at: at(9), ends_at: at(10, 30), expected_impact: -15, actual_energy_after: null, status: "scheduled", note: "Hoàn thành việc quan trọng nhất", series_id: null, recurrence: "none", occurrence_index: 0, overdue_acknowledged_at: null, created_at: timestamp, updated_at: timestamp },
      { id: id(), user_id: USER_ID, title: "Ăn trưa và đi bộ", category: "rest", schedule_type: "flexible", starts_at: at(12), ends_at: at(13), expected_impact: 15, actual_energy_after: null, status: "scheduled", note: "", series_id: null, recurrence: "none", occurrence_index: 0, overdue_acknowledged_at: null, created_at: timestamp, updated_at: timestamp },
      { id: id(), user_id: USER_ID, title: "Học một điều mới", category: "study", schedule_type: "flexible", starts_at: at(15), ends_at: at(16), expected_impact: -10, actual_energy_after: null, status: "scheduled", note: "Có thể chuyển nếu cần nghỉ", series_id: null, recurrence: "none", occurrence_index: 0, overdue_acknowledged_at: null, created_at: timestamp, updated_at: timestamp },
    ],
    todos: [],
  };
}

interface ParsedActivity {
  activity: Activity;
  migrated: boolean;
}

interface ParsedDemoData {
  data: DemoData;
  migrated: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOneOf<const T extends readonly string[]>(value: unknown, values: T): value is T[number] {
  return typeof value === "string" && values.some((item) => item === value);
}

function normalizeScheduleType(value: unknown): { value: Activity["schedule_type"]; migrated: boolean } | null {
  if (value === "recovery") return { value: "flexible", migrated: true };
  return isOneOf(value, scheduleTypes) ? { value, migrated: false } : null;
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function requireIntegerInRange(value: number, min: number, max: number, label: string): void {
  if (!isIntegerInRange(value, min, max)) {
    throw new Error(`${label} phải là số nguyên từ ${min} đến ${max}.`);
  }
}

function validateActivityEnergy(activity: Pick<Activity, "expected_impact" | "actual_energy_after">): void {
  requireIntegerInRange(activity.expected_impact, -50, 50, "Tác động dự kiến");
  if (activity.actual_energy_after !== null) {
    requireIntegerInRange(activity.actual_energy_after, 0, 100, "Năng lượng thực tế");
  }
}

function isIsoDateTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00+07:00`);
  return !Number.isNaN(date.getTime()) && dateKey(date) === value;
}

function validateTodo(todo: Todo): void {
  if (!todo.title.trim() || todo.title.trim().length > 160) throw new Error("Tiêu đề việc cần làm phải có từ 1 đến 160 ký tự.");
  if (!isDateKey(todo.scheduled_date)) throw new Error("Ngày lên lịch không hợp lệ.");
  if (todo.due_at !== null && !isIsoDateTime(todo.due_at)) throw new Error("Hạn hoàn thành không hợp lệ.");
  if (todo.due_at !== null && dateKey(new Date(todo.due_at)) !== todo.scheduled_date) {
    throw new Error("Hạn hoàn thành phải thuộc ngày đã lên lịch theo giờ Việt Nam.");
  }
  if ((todo.status === "completed") !== (todo.completed_at !== null)) {
    throw new Error("Thời điểm hoàn thành không nhất quán với trạng thái.");
  }
}

function parseProfile(value: unknown): Profile | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.display_name !== "string"
    || !isIntegerInRange(value.default_energy, 0, 100)) return null;
  return { id: value.id, display_name: value.display_name, default_energy: value.default_energy };
}

function parseDailyCheckin(value: unknown): DailyCheckin | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.user_id !== "string"
    || !isDateKey(value.checkin_date)
    || !isIntegerInRange(value.energy_level, 0, 100)
    || typeof value.note !== "string"
    || !isIsoDateTime(value.created_at)
    || !isIsoDateTime(value.updated_at)) return null;
  return {
    id: value.id,
    user_id: value.user_id,
    checkin_date: value.checkin_date,
    energy_level: value.energy_level,
    note: value.note,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
}

function parseActivity(value: unknown): ParsedActivity | null {
  if (!isRecord(value)) return null;
  const scheduleType = normalizeScheduleType(value.schedule_type);
  if (!scheduleType
    || typeof value.id !== "string"
    || typeof value.user_id !== "string"
    || typeof value.title !== "string"
    || !isOneOf(value.category, activityCategories)
    || !isIsoDateTime(value.starts_at)
    || !isIsoDateTime(value.ends_at)
    || !isIntegerInRange(value.expected_impact, -50, 50)
    || !isOneOf(value.status, activityStatuses)) return null;

  if (value.actual_energy_after !== undefined
    && value.actual_energy_after !== null
    && !isIntegerInRange(value.actual_energy_after, 0, 100)) return null;
  if (value.note !== undefined && typeof value.note !== "string") return null;
  if (value.series_id !== undefined && value.series_id !== null && typeof value.series_id !== "string") return null;
  if (value.recurrence !== undefined && !isOneOf(value.recurrence, recurrenceTypes)) return null;
  if (value.occurrence_index !== undefined
    && (typeof value.occurrence_index !== "number" || !Number.isInteger(value.occurrence_index))) return null;
  if (value.overdue_acknowledged_at !== undefined
    && value.overdue_acknowledged_at !== null
    && !isIsoDateTime(value.overdue_acknowledged_at)) return null;
  if (value.created_at !== undefined && typeof value.created_at !== "string") return null;
  if (value.updated_at !== undefined && typeof value.updated_at !== "string") return null;

  const seriesId = value.series_id ?? null;
  return {
    activity: {
      id: value.id,
      user_id: value.user_id,
      title: value.title,
      category: value.category,
      schedule_type: scheduleType.value,
      starts_at: value.starts_at,
      ends_at: value.ends_at,
      expected_impact: value.expected_impact,
      actual_energy_after: value.actual_energy_after ?? null,
      status: value.status,
      note: value.note ?? "",
      series_id: seriesId,
      recurrence: value.recurrence ?? (seriesId ? "weekly" : "none"),
      occurrence_index: value.occurrence_index ?? 0,
      overdue_acknowledged_at: value.overdue_acknowledged_at ?? null,
      created_at: value.created_at ?? value.starts_at,
      updated_at: value.updated_at ?? value.starts_at,
    },
    migrated: scheduleType.migrated
      || value.actual_energy_after === undefined
      || value.note === undefined
      || value.series_id === undefined
      || value.recurrence === undefined
      || value.occurrence_index === undefined
      || value.overdue_acknowledged_at === undefined
      || value.created_at === undefined
      || value.updated_at === undefined,
  };
}

function parseTodo(value: unknown): { todo: Todo; migrated: boolean } | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.user_id !== "string"
    || typeof value.title !== "string"
    || !isDateKey(value.scheduled_date)
    || (value.due_at !== null && !isIsoDateTime(value.due_at))
    || !isOneOf(value.status, todoStatuses)
    || typeof value.note !== "string"
    || (value.activity_id !== undefined && value.activity_id !== null && typeof value.activity_id !== "string")
    || (value.completed_at !== null && !isIsoDateTime(value.completed_at))
    || (value.overdue_acknowledged_at !== null && !isIsoDateTime(value.overdue_acknowledged_at))
    || !isIsoDateTime(value.created_at)
    || !isIsoDateTime(value.updated_at)) return null;

  const todo: Todo = {
    id: value.id,
    user_id: value.user_id,
    title: value.title,
    scheduled_date: value.scheduled_date,
    due_at: value.due_at,
    status: value.status,
    note: value.note,
    activity_id: value.activity_id ?? null,
    completed_at: value.completed_at,
    overdue_acknowledged_at: value.overdue_acknowledged_at,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
  try {
    validateTodo(todo);
  } catch {
    return null;
  }
  return { todo, migrated: value.activity_id === undefined };
}

function parseDemoData(value: unknown): ParsedDemoData | null {
  if (!isRecord(value) || !Array.isArray(value.checkins) || !Array.isArray(value.activities)) return null;
  if (value.todos !== undefined && !Array.isArray(value.todos)) return null;
  const profile = parseProfile(value.profile);
  if (!profile) return null;

  const checkins: DailyCheckin[] = [];
  for (const item of value.checkins) {
    const checkin = parseDailyCheckin(item);
    if (!checkin) return null;
    checkins.push(checkin);
  }

  const activities: Activity[] = [];
  let migrated = value.todos === undefined;
  for (const item of value.activities) {
    const parsed = parseActivity(item);
    if (!parsed) return null;
    activities.push(parsed.activity);
    migrated ||= parsed.migrated;
  }

  const todos: Todo[] = [];
  for (const item of value.todos ?? []) {
    const parsed = parseTodo(item);
    if (!parsed) return null;
    todos.push(parsed.todo);
    migrated ||= parsed.migrated;
  }

  return { data: { profile, checkins, activities, todos }, migrated };
}

function normalizeActivities(activities: Activity[]): Activity[] {
  const seriesIndexes = new Map<string, Map<string, number>>();
  const series = new Map<string, Activity[]>();
  for (const activity of activities) {
    if (activity.recurrence === "weekly" && activity.series_id) {
      const group = series.get(activity.series_id) ?? [];
      group.push(activity);
      series.set(activity.series_id, group);
    }
  }
  for (const [seriesId, occurrences] of series) {
    const existingIndexes = occurrences.map((activity) => activity.occurrence_index);
    const indexesAreValid = existingIndexes.every((index) => Number.isInteger(index) && index >= 0 && index <= 11)
      && new Set(existingIndexes).size === existingIndexes.length;
    const indexes = new Map<string, number>();
    if (indexesAreValid) occurrences.forEach((activity) => indexes.set(activity.id, activity.occurrence_index));
    else [...occurrences]
      .sort((left, right) => left.starts_at.localeCompare(right.starts_at) || left.id.localeCompare(right.id))
      .forEach((activity, index) => indexes.set(activity.id, index));
    seriesIndexes.set(seriesId, indexes);
  }
  return activities.map((activity) => {
    if (activity.recurrence === "none") return { ...activity, series_id: null, occurrence_index: 0 };
    const seriesId = activity.series_id ?? id();
    const occurrenceIndex = seriesIndexes.get(seriesId)?.get(activity.id) ?? 0;
    if (occurrenceIndex > 11) return { ...activity, series_id: null, recurrence: "none", occurrence_index: 0 };
    return { ...activity, series_id: seriesId, occurrence_index: occurrenceIndex };
  });
}

function fallbackToMemory(data?: DemoData): DemoData {
  useMemoryStorage = true;
  if (data) memoryData = data;
  if (!memoryData) memoryData = initialData();
  return memoryData;
}

function save(data: DemoData): void {
  if (useMemoryStorage) {
    memoryData = data;
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    fallbackToMemory(data);
  }
}

function load(): DemoData {
  if (useMemoryStorage) return fallbackToMemory();

  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return fallbackToMemory();
  }

  if (raw === null) {
    const data = initialData();
    save(data);
    return data;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const data = initialData();
    save(data);
    return data;
  }

  const decoded = parseDemoData(parsed);
  if (!decoded) {
    const data = initialData();
    save(data);
    return data;
  }

  const normalized = { ...decoded.data, activities: normalizeActivities(decoded.data.activities) };
  if (decoded.migrated || JSON.stringify(normalized.activities) !== JSON.stringify(decoded.data.activities)) save(normalized);
  return normalized;
}

function selected(activity: Activity, source: Activity, scope: ActionScope): boolean {
  if (scope === "single" || !source.series_id) return activity.id === source.id;
  if (activity.series_id !== source.series_id) return false;
  return scope === "all" || activity.occurrence_index >= source.occurrence_index;
}

function changesForOccurrence(activity: Activity, source: Activity, changes: ActivityChanges): ActivityChanges {
  const result = { ...changes };
  if (changes.starts_at && activity.id !== source.id) {
    const delta = new Date(changes.starts_at).getTime() - new Date(source.starts_at).getTime();
    result.starts_at = new Date(new Date(activity.starts_at).getTime() + delta).toISOString();
  }
  if (changes.ends_at && activity.id !== source.id) {
    const delta = new Date(changes.ends_at).getTime() - new Date(source.ends_at).getTime();
    result.ends_at = new Date(new Date(activity.ends_at).getTime() + delta).toISOString();
  }
  if (result.status && result.status !== "completed") result.actual_energy_after = null;
  return result;
}

export class DemoRepository implements EnergyRepository {
  async getProfile(): Promise<Profile> { return load().profile; }

  async saveProfile(profile: Pick<Profile, "display_name" | "default_energy">): Promise<Profile> {
    requireIntegerInRange(profile.default_energy, 0, 100, "Năng lượng mặc định");
    const data = load();
    data.profile = { ...data.profile, ...profile };
    save(data);
    return data.profile;
  }

  async getCheckin(date: string): Promise<DailyCheckin | null> {
    return load().checkins.find((item) => item.checkin_date === date) ?? null;
  }

  async listCheckins(fromDate: string, toDate: string): Promise<DailyCheckin[]> {
    return load().checkins.filter((item) => item.checkin_date >= fromDate && item.checkin_date <= toDate);
  }

  async saveCheckin(date: string, energy: number, note: string): Promise<DailyCheckin> {
    requireIntegerInRange(energy, 0, 100, "Năng lượng check-in");
    if (!isDateKey(date)) throw new Error("Ngày check-in không hợp lệ.");
    const data = load();
    const now = new Date().toISOString();
    const existing = data.checkins.find((item) => item.checkin_date === date);
    if (existing) {
      existing.energy_level = energy;
      existing.note = note;
      existing.updated_at = now;
      save(data);
      return existing;
    }
    const checkin: DailyCheckin = { id: id(), user_id: USER_ID, checkin_date: date, energy_level: energy, note, created_at: now, updated_at: now };
    data.checkins.push(checkin);
    save(data);
    return checkin;
  }

  async getActivity(activityId: string): Promise<Activity | null> {
    return load().activities.find((item) => item.id === activityId) ?? null;
  }

  async getTodoByActivity(activityId: string): Promise<Todo | null> {
    return load().todos.find((item) => item.activity_id === activityId) ?? null;
  }

  async listActivities(from: string, to: string): Promise<Activity[]> {
    return load().activities
      .filter((item) => item.starts_at <= to && item.ends_at >= from)
      .sort(compareActivitiesByImpactTime);
  }

  async listOverdueActivities(before: string): Promise<Activity[]> {
    return load().activities
      .filter((item) => item.status === "scheduled"
        && item.overdue_acknowledged_at === null
        && item.ends_at < before)
      .sort(compareActivitiesByImpactTime);
  }

  async createActivity(draft: ActivityDraft): Promise<Activity[]> {
    validateActivityEnergy({ expected_impact: draft.expected_impact, actual_energy_after: null });
    const data = load();
    const now = new Date().toISOString();
    const seriesId = draft.recurrence === "weekly" ? id() : null;
    const count = draft.recurrence === "weekly" ? 12 : 1;
    const created = Array.from({ length: count }, (_, index): Activity => ({
      ...draft,
      id: id(),
      user_id: USER_ID,
      starts_at: addWeeks(new Date(draft.starts_at), index).toISOString(),
      ends_at: addWeeks(new Date(draft.ends_at), index).toISOString(),
      actual_energy_after: null,
      status: "scheduled",
      series_id: seriesId,
      occurrence_index: index,
      overdue_acknowledged_at: null,
      created_at: now,
      updated_at: now,
    }));
    data.activities.push(...created);
    save(data);
    return created;
  }

  async updateActivity(activity: Activity, changes: ActivityChanges, scope: ActionScope): Promise<void> {
    const data = load();
    const now = new Date().toISOString();
    const updatedActivities = data.activities.map((item) => selected(item, activity, scope)
      ? { ...item, ...changesForOccurrence(item, activity, changes), updated_at: now }
      : item);
    updatedActivities.forEach(validateActivityEnergy);
    data.activities = updatedActivities;
    save(data);
  }

  async deleteActivity(activity: Activity, scope: ActionScope): Promise<void> {
    const data = load();
    const deletedIds = new Set(data.activities.filter((item) => selected(item, activity, scope)).map((item) => item.id));
    data.activities = data.activities.filter((item) => !deletedIds.has(item.id));
    data.todos = data.todos.map((todo) => todo.activity_id && deletedIds.has(todo.activity_id) ? { ...todo, activity_id: null } : todo);
    save(data);
  }

  async listTodos(fromDate?: string, toDate?: string): Promise<Todo[]> {
    if ((fromDate === undefined) !== (toDate === undefined)) {
      throw new Error("Khoảng ngày việc cần làm phải có đủ ngày bắt đầu và kết thúc.");
    }
    return load().todos
      .filter((item) => fromDate === undefined
        || toDate === undefined
        || (item.scheduled_date >= fromDate && item.scheduled_date <= toDate))
      .sort((left, right) => left.scheduled_date.localeCompare(right.scheduled_date)
        || (left.due_at ?? "").localeCompare(right.due_at ?? "")
        || left.created_at.localeCompare(right.created_at)
        || left.id.localeCompare(right.id));
  }

  async listOverdueTodos(todayDate: string, nowIso: string): Promise<Todo[]> {
    return load().todos
      .filter((item) => item.activity_id === null
        && item.status === "pending"
        && item.overdue_acknowledged_at === null
        && (item.due_at !== null ? item.due_at < nowIso : item.scheduled_date < todayDate))
      .sort((left, right) => (left.due_at ?? `${left.scheduled_date}T23:59:59+07:00`)
        .localeCompare(right.due_at ?? `${right.scheduled_date}T23:59:59+07:00`));
  }

  async createTodo(draft: TodoDraft): Promise<Todo> {
    const data = load();
    const now = new Date().toISOString();
    const todo: Todo = {
      ...draft,
      id: id(),
      user_id: USER_ID,
      status: "pending",
      completed_at: null,
      overdue_acknowledged_at: null,
      created_at: now,
      updated_at: now,
    };
    validateTodo(todo);
    data.todos.push(todo);
    save(data);
    return todo;
  }

  async updateTodo(todo: Todo, changes: TodoChanges): Promise<Todo> {
    const data = load();
    const index = data.todos.findIndex((item) => item.id === todo.id);
    if (index < 0) throw new Error("Không tìm thấy việc cần làm để cập nhật.");
    const now = new Date().toISOString();
    const status = changes.status ?? data.todos[index].status;
    const completedAt = status === "completed"
      ? changes.completed_at === undefined ? data.todos[index].completed_at ?? now : changes.completed_at
      : null;
    const resetAcknowledgement = changes.overdue_acknowledged_at === undefined
      && (changes.scheduled_date !== undefined || changes.due_at !== undefined || changes.status === "pending");
    const updated: Todo = {
      ...data.todos[index],
      ...changes,
      id: data.todos[index].id,
      user_id: data.todos[index].user_id,
      status,
      completed_at: completedAt,
      overdue_acknowledged_at: resetAcknowledgement ? null : changes.overdue_acknowledged_at ?? data.todos[index].overdue_acknowledged_at,
      created_at: data.todos[index].created_at,
      updated_at: now,
    };
    validateTodo(updated);
    data.todos[index] = updated;
    save(data);
    return updated;
  }

  async deleteLinkedTodo(todo: Todo, activity: Activity): Promise<void> {
    const data = load();
    const hasTodo = data.todos.some((item) => item.id === todo.id && item.activity_id === activity.id);
    const hasActivity = data.activities.some((item) => item.id === activity.id);
    if (!hasTodo || !hasActivity) throw new Error("Không tìm thấy cặp Todo và hoạt động để xoá.");
    data.todos = data.todos.filter((item) => item.id !== todo.id);
    data.activities = data.activities.filter((item) => item.id !== activity.id);
    save(data);
  }

  async deleteTodo(todo: Todo): Promise<void> {
    const data = load();
    const remaining = data.todos.filter((item) => item.id !== todo.id);
    if (remaining.length === data.todos.length) throw new Error("Không tìm thấy việc cần làm để xoá.");
    data.todos = remaining;
    save(data);
  }
}
