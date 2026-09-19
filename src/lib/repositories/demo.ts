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
  type ActivitySeries,
  type DailyCheckin,
  type Profile,
  type Todo,
  type TodoChanges,
  type TodoDraft,
} from "@/lib/types";

const STORAGE_KEY = "hom-nay-the-nao-demo-v1";
const USER_ID = "demo-user";

interface SeriesExclusion {
  series_id: string;
  occurrence_index: number;
}

interface DemoData {
  profile: Profile;
  checkins: DailyCheckin[];
  activities: Activity[];
  activitySeries: ActivitySeries[];
  activitySeriesExclusions: SeriesExclusion[];
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
      { id: id(), user_id: USER_ID, title: "Tập trung làm việc", category: "work", schedule_type: "fixed", starts_at: at(9), ends_at: at(10, 30), expected_impact: -15, actual_energy_after: null, status: "scheduled", note: "Hoàn thành việc quan trọng nhất", series_id: null, recurrence: "none", recurrence_end_date: null, occurrence_index: 0, overdue_acknowledged_at: null, created_at: timestamp, updated_at: timestamp },
      { id: id(), user_id: USER_ID, title: "Ăn trưa và đi bộ", category: "rest", schedule_type: "flexible", starts_at: at(12), ends_at: at(13), expected_impact: 15, actual_energy_after: null, status: "scheduled", note: "", series_id: null, recurrence: "none", recurrence_end_date: null, occurrence_index: 0, overdue_acknowledged_at: null, created_at: timestamp, updated_at: timestamp },
      { id: id(), user_id: USER_ID, title: "Học một điều mới", category: "study", schedule_type: "flexible", starts_at: at(15), ends_at: at(16), expected_impact: -10, actual_energy_after: null, status: "scheduled", note: "Có thể chuyển nếu cần nghỉ", series_id: null, recurrence: "none", recurrence_end_date: null, occurrence_index: 0, overdue_acknowledged_at: null, created_at: timestamp, updated_at: timestamp },
    ],
    activitySeries: [],
    activitySeriesExclusions: [],
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
  if (value.recurrence_end_date !== undefined && value.recurrence_end_date !== null && !isDateKey(value.recurrence_end_date)) return null;
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
      recurrence_end_date: value.recurrence_end_date ?? null,
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
      || value.recurrence_end_date === undefined
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

function parseActivitySeries(value: unknown): ActivitySeries | null {
  if (!isRecord(value)
    || typeof value.id !== "string"
    || typeof value.user_id !== "string"
    || typeof value.title !== "string"
    || !isOneOf(value.category, activityCategories)
    || value.schedule_type !== "fixed"
    || !isIsoDateTime(value.anchor_starts_at)
    || !isIsoDateTime(value.anchor_ends_at)
    || !isIntegerInRange(value.expected_impact, -50, 50)
    || typeof value.note !== "string"
    || (value.ends_on !== null && !isDateKey(value.ends_on))
    || !isIsoDateTime(value.created_at)
    || !isIsoDateTime(value.updated_at)) return null;
  return value as unknown as ActivitySeries;
}

function parseSeriesExclusion(value: unknown): SeriesExclusion | null {
  if (!isRecord(value) || typeof value.series_id !== "string" || typeof value.occurrence_index !== "number" || !Number.isInteger(value.occurrence_index) || value.occurrence_index < 0) return null;
  return { series_id: value.series_id, occurrence_index: value.occurrence_index };
}

function parseDemoData(value: unknown): ParsedDemoData | null {
  if (!isRecord(value) || !Array.isArray(value.checkins) || !Array.isArray(value.activities)) return null;
  if (value.todos !== undefined && !Array.isArray(value.todos)) return null;
  if (value.activitySeries !== undefined && !Array.isArray(value.activitySeries)) return null;
  if (value.activitySeriesExclusions !== undefined && !Array.isArray(value.activitySeriesExclusions)) return null;
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

  const activitySeries: ActivitySeries[] = [];
  for (const item of value.activitySeries ?? []) {
    const parsed = parseActivitySeries(item);
    if (!parsed) return null;
    activitySeries.push(parsed);
  }
  const activitySeriesExclusions: SeriesExclusion[] = [];
  for (const item of value.activitySeriesExclusions ?? []) {
    const parsed = parseSeriesExclusion(item);
    if (!parsed) return null;
    activitySeriesExclusions.push(parsed);
  }
  migrated ||= value.activitySeries === undefined || value.activitySeriesExclusions === undefined;

  const todos: Todo[] = [];
  for (const item of value.todos ?? []) {
    const parsed = parseTodo(item);
    if (!parsed) return null;
    todos.push(parsed.todo);
    migrated ||= parsed.migrated;
  }

  return { data: { profile, checkins, activities, activitySeries, activitySeriesExclusions, todos }, migrated };
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
    const indexesAreValid = existingIndexes.every((index) => Number.isInteger(index) && index >= 0)
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
    return { ...activity, series_id: seriesId, occurrence_index: occurrenceIndex };
  });
}

function canonicalLegacyGrid(occurrences: Activity[]): {
  source: Activity;
  anchorStartsAt: string;
  anchorEndsAt: string;
} {
  const candidates = occurrences.map((activity) => {
    const offset = activity.occurrence_index * 7 * 86_400_000;
    const anchorStartsAt = new Date(new Date(activity.starts_at).getTime() - offset).toISOString();
    const anchorEndsAt = new Date(new Date(activity.ends_at).getTime() - offset).toISOString();
    return { activity, anchorStartsAt, anchorEndsAt, key: `${anchorStartsAt}\u0000${anchorEndsAt}` };
  });
  const gridCounts = new Map<string, number>();
  for (const candidate of candidates) gridCounts.set(candidate.key, (gridCounts.get(candidate.key) ?? 0) + 1);
  const canonical = candidates.sort((left, right) =>
    (gridCounts.get(right.key) ?? 0) - (gridCounts.get(left.key) ?? 0)
    || left.anchorStartsAt.localeCompare(right.anchorStartsAt)
    || left.anchorEndsAt.localeCompare(right.anchorEndsAt)
    || left.activity.occurrence_index - right.activity.occurrence_index
    || left.activity.starts_at.localeCompare(right.activity.starts_at)
    || left.activity.id.localeCompare(right.activity.id))[0];
  return { source: canonical.activity, anchorStartsAt: canonical.anchorStartsAt, anchorEndsAt: canonical.anchorEndsAt };
}

function ensureSeriesData(data: DemoData): DemoData {
  const byId = new Map(data.activitySeries.map((series) => [series.id, series]));
  const groups = new Map<string, Activity[]>();
  for (const activity of data.activities) {
    if (!activity.series_id || activity.recurrence !== "weekly") continue;
    const group = groups.get(activity.series_id) ?? [];
    group.push(activity);
    groups.set(activity.series_id, group);
  }
  for (const [seriesId, occurrences] of groups) {
    if (byId.has(seriesId)) continue;
    const { source, anchorStartsAt, anchorEndsAt } = canonicalLegacyGrid(occurrences);
    const existingIndexes = new Set(occurrences.map((item) => item.occurrence_index));
    const finalIndex = Math.max(...existingIndexes);
    const anchorDate = dateKey(new Date(anchorStartsAt));
    const horizonStart = new Date(`${anchorDate}T00:00:00+07:00`).getTime();
    const series: ActivitySeries = {
      id: seriesId, user_id: source.user_id, title: source.title, category: source.category, schedule_type: "fixed",
      anchor_starts_at: anchorStartsAt, anchor_ends_at: anchorEndsAt,
      expected_impact: source.expected_impact, note: source.note,
      ends_on: dateKey(new Date(horizonStart + finalIndex * 7 * 86_400_000)),
      created_at: source.created_at, updated_at: source.updated_at,
    };
    data.activitySeries.push(series);
    byId.set(seriesId, series);
    for (let index = 0; index <= finalIndex; index += 1) {
      if (!existingIndexes.has(index)) data.activitySeriesExclusions.push({ series_id: seriesId, occurrence_index: index });
    }
  }
  data.activities = data.activities.map((activity) => ({
    ...activity,
    schedule_type: activity.series_id && byId.has(activity.series_id) ? "fixed" : activity.schedule_type,
    recurrence_end_date: activity.series_id ? byId.get(activity.series_id)?.ends_on ?? null : null,
  }));
  return data;
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

  const normalized = ensureSeriesData({ ...decoded.data, activities: normalizeActivities(decoded.data.activities) });
  if (decoded.migrated || JSON.stringify(normalized) !== JSON.stringify(decoded.data)) save(normalized);
  return normalized;
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const OVERDUE_MATERIALIZATION_DAYS = 28;

function cutoffBefore(series: ActivitySeries, occurrenceIndex: number): string {
  return dateKey(new Date(new Date(series.anchor_starts_at).getTime() + occurrenceIndex * WEEK_MS - 86_400_000));
}

function finalOccurrenceIndex(series: ActivitySeries): number | null {
  if (!series.ends_on) return null;
  const anchorDate = dateKey(new Date(series.anchor_starts_at));
  const anchorMs = new Date(`${anchorDate}T00:00:00+07:00`).getTime();
  const endMs = new Date(`${series.ends_on}T00:00:00+07:00`).getTime();
  return Math.floor((endMs - anchorMs) / WEEK_MS);
}

function materializeRange(data: DemoData, from: string, to: string): boolean {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const existing = new Set(data.activities.filter((item) => item.series_id).map((item) => `${item.series_id}:${item.occurrence_index}`));
  const exclusions = new Set(data.activitySeriesExclusions.map((item) => `${item.series_id}:${item.occurrence_index}`));
  let changed = false;
  for (const series of data.activitySeries) {
    const anchorStart = new Date(series.anchor_starts_at).getTime();
    const anchorEnd = new Date(series.anchor_ends_at).getTime();
    const first = Math.max(0, Math.ceil((fromMs - anchorEnd) / WEEK_MS));
    const last = Math.floor((toMs - anchorStart) / WEEK_MS);
    for (let index = first; index <= last; index += 1) {
      const key = `${series.id}:${index}`;
      const startsAt = new Date(anchorStart + index * WEEK_MS).toISOString();
      if ((series.ends_on && dateKey(new Date(startsAt)) > series.ends_on) || existing.has(key) || exclusions.has(key)) continue;
      const now = new Date().toISOString();
      data.activities.push({
        id: id(), user_id: series.user_id, title: series.title, category: series.category, schedule_type: "fixed",
        starts_at: startsAt, ends_at: new Date(anchorEnd + index * WEEK_MS).toISOString(), expected_impact: series.expected_impact,
        actual_energy_after: null, status: "scheduled", note: series.note, series_id: series.id, recurrence: "weekly",
        recurrence_end_date: series.ends_on, occurrence_index: index, overdue_acknowledged_at: null, created_at: now, updated_at: now,
      });
      existing.add(key);
      changed = true;
    }
  }
  return changed;
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

function deleteActivityFromData(data: DemoData, activityId: string, scope: ActionScope): void {
  const source = data.activities.find((item) => item.id === activityId);
  if (!source) throw new Error("Không tìm thấy hoạt động để xoá.");
  const series = source.series_id ? data.activitySeries.find((item) => item.id === source.series_id) : null;
  if (!series) {
    data.activities = data.activities.filter((item) => item.id !== source.id);
    data.todos = data.todos.map((todo) => todo.activity_id === source.id ? { ...todo, activity_id: null } : todo);
    return;
  }

  const deletedIds = new Set(data.activities.filter((item) => selected(item, source, scope)).map((item) => item.id));
  if (scope === "single") {
    if (!data.activitySeriesExclusions.some((item) => item.series_id === series.id && item.occurrence_index === source.occurrence_index)) {
      data.activitySeriesExclusions.push({ series_id: series.id, occurrence_index: source.occurrence_index });
    }
  } else if (scope === "future") {
    if (source.occurrence_index === 0) {
      data.activitySeries = data.activitySeries.filter((item) => item.id !== series.id);
      data.activitySeriesExclusions = data.activitySeriesExclusions.filter((item) => item.series_id !== series.id);
    } else {
      series.ends_on = cutoffBefore(series, source.occurrence_index);
      series.updated_at = new Date().toISOString();
      data.activitySeriesExclusions = data.activitySeriesExclusions.filter((item) => item.series_id !== series.id || item.occurrence_index < source.occurrence_index);
    }
  } else {
    data.activitySeries = data.activitySeries.filter((item) => item.id !== series.id);
    data.activitySeriesExclusions = data.activitySeriesExclusions.filter((item) => item.series_id !== series.id);
  }
  data.activities = data.activities.filter((item) => !deletedIds.has(item.id));
  data.todos = data.todos.map((todo) => todo.activity_id && deletedIds.has(todo.activity_id) ? { ...todo, activity_id: null } : todo);
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
    const data = load();
    if (materializeRange(data, from, to)) save(data);
    return data.activities
      .filter((item) => item.starts_at <= to && item.ends_at >= from)
      .sort(compareActivitiesByImpactTime);
  }

  async listOverdueActivities(before: string): Promise<Activity[]> {
    const beforeTime = new Date(before).getTime();
    if (!Number.isFinite(beforeTime)) throw new Error("Mốc thời gian kiểm tra quá hạn không hợp lệ.");
    const historicalFrom = new Date(beforeTime - OVERDUE_MATERIALIZATION_DAYS * DAY_MS).toISOString();
    const data = load();
    // Product policy: materialize and show at most the previous 28 days.
    if (materializeRange(data, historicalFrom, before)) save(data);
    return data.activities
      .filter((item) => item.status === "scheduled"
        && item.overdue_acknowledged_at === null
        && item.ends_at >= historicalFrom
        && item.ends_at < before)
      .sort(compareActivitiesByImpactTime);
  }

  async createActivity(draft: ActivityDraft): Promise<Activity[]> {
    validateActivityEnergy({ expected_impact: draft.expected_impact, actual_energy_after: null });
    const data = load();
    const now = new Date().toISOString();
    const recurring = draft.schedule_type === "fixed" && draft.recurrence === "weekly";
    const recurrenceEndDate = recurring ? draft.recurrence_end_date : null;
    if (recurrenceEndDate && recurrenceEndDate < dateKey(new Date(draft.starts_at))) {
      throw new Error("Ngày kết thúc lặp cần bằng hoặc sau ngày bắt đầu.");
    }
    const seriesId = recurring ? id() : null;
    if (seriesId) data.activitySeries.push({
      id: seriesId, user_id: USER_ID, title: draft.title, category: draft.category, schedule_type: "fixed",
      anchor_starts_at: draft.starts_at, anchor_ends_at: draft.ends_at, expected_impact: draft.expected_impact,
      note: draft.note, ends_on: recurrenceEndDate, created_at: now, updated_at: now,
    });
    const created: Activity = {
      ...draft,
      id: id(), user_id: USER_ID, schedule_type: recurring ? "fixed" : draft.schedule_type,
      recurrence: recurring ? "weekly" : "none", recurrence_end_date: recurrenceEndDate,
      actual_energy_after: null, status: "scheduled", series_id: seriesId, occurrence_index: 0,
      overdue_acknowledged_at: null, created_at: now, updated_at: now,
    };
    data.activities.push(created);
    save(data);
    return [created];
  }

  async updateActivity(activity: Activity, changes: ActivityChanges, scope: ActionScope): Promise<void> {
    const data = load();
    const now = new Date().toISOString();
    const source = data.activities.find((item) => item.id === activity.id);
    if (!source) throw new Error("Không tìm thấy hoạt động để cập nhật.");
    const series = source.series_id ? data.activitySeries.find((item) => item.id === source.series_id) : null;
    if (series && scope === "single" && changes.recurrence_end_date !== undefined
      && changes.recurrence_end_date !== series.ends_on) {
      throw new Error("Ngày kết thúc lặp thuộc chuỗi. Hãy chọn ‘Buổi này + sau’ hoặc ‘Cả chuỗi’.");
    }
    if (!series) {
      const makeRecurring = (changes.schedule_type ?? source.schedule_type) === "fixed" && changes.recurrence === "weekly";
      if (makeRecurring) {
        const startsAt = changes.starts_at ?? source.starts_at;
        const endsAt = changes.ends_at ?? source.ends_at;
        const endsOn = changes.recurrence_end_date ?? null;
        if (endsOn && endsOn < dateKey(new Date(startsAt))) throw new Error("Ngày kết thúc lặp cần bằng hoặc sau ngày bắt đầu.");
        const seriesId = id();
        data.activitySeries.push({
          id: seriesId, user_id: source.user_id, title: changes.title ?? source.title, category: changes.category ?? source.category,
          schedule_type: "fixed", anchor_starts_at: startsAt, anchor_ends_at: endsAt,
          expected_impact: changes.expected_impact ?? source.expected_impact, note: changes.note ?? source.note,
          ends_on: endsOn, created_at: now, updated_at: now,
        });
        const updated: Activity = { ...source, ...changes, schedule_type: "fixed", series_id: seriesId, recurrence: "weekly", recurrence_end_date: endsOn, occurrence_index: 0, updated_at: now };
        validateActivityEnergy(updated);
        data.activities = data.activities.map((item) => item.id === source.id ? updated : item);
        save(data);
        return;
      }
      const normalized = changes.schedule_type === "flexible" || changes.recurrence === "none"
        ? { ...changes, recurrence: "none" as const, recurrence_end_date: null }
        : changes;
      const updated = { ...source, ...normalized, series_id: null, occurrence_index: 0, updated_at: now };
      validateActivityEnergy(updated);
      data.activities = data.activities.map((item) => item.id === source.id ? updated : item);
      save(data);
      return;
    }

    const detach = changes.schedule_type === "flexible" || changes.recurrence === "none";
    if (detach) {
      const targets = data.activities.filter((item) => selected(item, source, scope));
      if (scope === "all") {
        const resultSchedule = changes.schedule_type ?? source.schedule_type;
        data.activities = data.activities.map((item) => item.series_id === series.id
          ? { ...item, ...changesForOccurrence(item, source, changes), schedule_type: resultSchedule, series_id: null, recurrence: "none", recurrence_end_date: null, occurrence_index: 0, updated_at: now }
          : item);
        data.activitySeries = data.activitySeries.filter((item) => item.id !== series.id);
        data.activitySeriesExclusions = data.activitySeriesExclusions.filter((item) => item.series_id !== series.id);
      } else {
        data.activitySeriesExclusions.push({ series_id: series.id, occurrence_index: source.occurrence_index });
        if (scope === "future") {
          if (source.occurrence_index === 0) {
            data.activitySeries = data.activitySeries.filter((item) => item.id !== series.id);
            data.activitySeriesExclusions = data.activitySeriesExclusions.filter((item) => item.series_id !== series.id);
          } else {
            series.ends_on = cutoffBefore(series, source.occurrence_index);
            series.updated_at = now;
          }
          const futureIds = new Set(targets.filter((item) => item.id !== source.id).map((item) => item.id));
          data.activities = data.activities.filter((item) => !futureIds.has(item.id));
          data.todos = data.todos.map((todo) => todo.activity_id && futureIds.has(todo.activity_id) ? { ...todo, activity_id: null } : todo);
        }
        const resultSchedule = changes.schedule_type ?? source.schedule_type;
        data.activities = data.activities.map((item) => item.id === source.id
          ? { ...item, ...changesForOccurrence(item, source, changes), schedule_type: resultSchedule, series_id: null, recurrence: "none", recurrence_end_date: null, occurrence_index: 0, updated_at: now }
          : item);
      }
      data.activities.forEach(validateActivityEnergy);
      save(data);
      return;
    }

    const requestedEnd = changes.recurrence_end_date === undefined ? series.ends_on : changes.recurrence_end_date;
    if (scope === "future" || scope === "all") {
      const anchorStart = scope === "future"
        ? changes.starts_at ?? source.starts_at
        : new Date(new Date(series.anchor_starts_at).getTime()
          + (changes.starts_at ? new Date(changes.starts_at).getTime() - new Date(source.starts_at).getTime() : 0)).toISOString();
      if (requestedEnd && requestedEnd < dateKey(new Date(anchorStart))) {
        throw new Error("Ngày kết thúc lặp cần bằng hoặc sau ngày bắt đầu của chuỗi.");
      }
    }

    if (scope === "future") {
      const newId = id();
      const newStart = changes.starts_at ?? source.starts_at;
      const newEnd = changes.ends_at ?? source.ends_at;
      const newSeries: ActivitySeries = {
        ...series, id: newId, title: changes.title ?? source.title, category: changes.category ?? source.category,
        schedule_type: "fixed", anchor_starts_at: newStart, anchor_ends_at: newEnd,
        expected_impact: changes.expected_impact ?? source.expected_impact, note: changes.note ?? source.note,
        ends_on: changes.recurrence_end_date === undefined ? series.ends_on : changes.recurrence_end_date,
        created_at: now, updated_at: now,
      };
      if (source.occurrence_index > 0) {
        series.ends_on = cutoffBefore(series, source.occurrence_index);
        series.updated_at = now;
      }
      data.activitySeries.push(newSeries);
      data.activities = data.activities.map((item) => {
        if (item.series_id !== series.id || item.occurrence_index < source.occurrence_index) return item;
        const shifted = changesForOccurrence(item, source, changes);
        return { ...item, ...shifted, schedule_type: "fixed", series_id: newId, recurrence: "weekly", recurrence_end_date: newSeries.ends_on, occurrence_index: item.occurrence_index - source.occurrence_index, updated_at: now };
      });
      data.activitySeriesExclusions = data.activitySeriesExclusions.map((item) => item.series_id === series.id && item.occurrence_index >= source.occurrence_index
        ? { series_id: newId, occurrence_index: item.occurrence_index - source.occurrence_index }
        : item);
      if (source.occurrence_index === 0) data.activitySeries = data.activitySeries.filter((item) => item.id !== series.id);
    } else {
      if (scope === "all") {
        const startDelta = changes.starts_at ? new Date(changes.starts_at).getTime() - new Date(source.starts_at).getTime() : 0;
        const endDelta = changes.ends_at ? new Date(changes.ends_at).getTime() - new Date(source.ends_at).getTime() : 0;
        series.title = changes.title ?? series.title;
        series.category = changes.category ?? series.category;
        series.anchor_starts_at = new Date(new Date(series.anchor_starts_at).getTime() + startDelta).toISOString();
        series.anchor_ends_at = new Date(new Date(series.anchor_ends_at).getTime() + endDelta).toISOString();
        series.expected_impact = changes.expected_impact ?? series.expected_impact;
        series.note = changes.note ?? series.note;
        if (changes.recurrence_end_date !== undefined) series.ends_on = changes.recurrence_end_date;
        series.updated_at = now;
      }
      data.activities = data.activities.map((item) => selected(item, source, scope)
        ? { ...item, ...changesForOccurrence(item, source, changes), recurrence: "weekly", recurrence_end_date: series.ends_on, updated_at: now }
        : item);
    }
    const expiredIds = new Set(data.activities.filter((item) => {
      if (!item.series_id) return false;
      const itemSeries = data.activitySeries.find((value) => value.id === item.series_id);
      const finalIndex = itemSeries ? finalOccurrenceIndex(itemSeries) : null;
      return finalIndex !== null && item.occurrence_index > finalIndex;
    }).map((item) => item.id));
    data.activities = data.activities.filter((item) => !expiredIds.has(item.id));
    data.activitySeriesExclusions = data.activitySeriesExclusions.filter((exclusion) => {
      const exclusionSeries = data.activitySeries.find((item) => item.id === exclusion.series_id);
      if (!exclusionSeries) return false;
      const finalIndex = finalOccurrenceIndex(exclusionSeries);
      return finalIndex === null || exclusion.occurrence_index <= finalIndex;
    });
    data.todos = data.todos.map((todo) => todo.activity_id && expiredIds.has(todo.activity_id) ? { ...todo, activity_id: null } : todo);
    data.activities.forEach(validateActivityEnergy);
    save(data);
  }

  async deleteActivity(activity: Activity, scope: ActionScope): Promise<void> {
    const data = load();
    deleteActivityFromData(data, activity.id, scope);
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

  async deleteLinkedTodo(todo: Todo, activity: Activity, scope: ActionScope): Promise<void> {
    const data = load();
    const hasTodo = data.todos.some((item) => item.id === todo.id && item.activity_id === activity.id);
    const hasActivity = data.activities.some((item) => item.id === activity.id);
    if (!hasTodo || !hasActivity) throw new Error("Không tìm thấy cặp Todo và hoạt động để xoá.");
    data.todos = data.todos.filter((item) => item.id !== todo.id);
    deleteActivityFromData(data, activity.id, scope);
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
