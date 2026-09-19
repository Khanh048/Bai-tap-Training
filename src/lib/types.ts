export const activityCategories = ["study", "work", "social", "personal", "rest"] as const;
export const scheduleTypes = ["fixed", "flexible"] as const;
export const activityStatuses = ["scheduled", "completed", "skipped", "cancelled"] as const;
export const recurrenceTypes = ["none", "weekly"] as const;
export const todoStatuses = ["pending", "completed", "cancelled"] as const;

export type ActivityCategory = (typeof activityCategories)[number];
export type ScheduleType = (typeof scheduleTypes)[number];
export type ActivityStatus = (typeof activityStatuses)[number];
export type Recurrence = (typeof recurrenceTypes)[number];
export type TodoStatus = (typeof todoStatuses)[number];
export type ActionScope = "single" | "future" | "all";

export interface Profile {
  id: string;
  display_name: string;
  default_energy: number;
}

export interface DailyCheckin {
  id: string;
  user_id: string;
  checkin_date: string;
  energy_level: number;
  note: string;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  user_id: string;
  title: string;
  category: ActivityCategory;
  schedule_type: ScheduleType;
  starts_at: string;
  ends_at: string;
  expected_impact: number;
  actual_energy_after: number | null;
  status: ActivityStatus;
  note: string;
  series_id: string | null;
  recurrence: Recurrence;
  occurrence_index: number;
  overdue_acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ActivityDraft = Pick<
  Activity,
  "title" | "category" | "schedule_type" | "starts_at" | "ends_at" | "expected_impact" | "note" | "recurrence"
>;

export type ActivityChanges = Partial<
  Pick<Activity, "title" | "category" | "schedule_type" | "starts_at" | "ends_at" | "expected_impact" | "actual_energy_after" | "status" | "note" | "overdue_acknowledged_at">
>;

export interface Todo {
  id: string;
  user_id: string;
  title: string;
  scheduled_date: string;
  due_at: string | null;
  status: TodoStatus;
  note: string;
  activity_id: string | null;
  completed_at: string | null;
  overdue_acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TodoDraft = Pick<Todo, "title" | "scheduled_date" | "due_at" | "note" | "activity_id">;

export type TodoChanges = Partial<
  Pick<Todo, "title" | "scheduled_date" | "due_at" | "status" | "note" | "activity_id" | "completed_at" | "overdue_acknowledged_at">
>;

export interface ForecastActivity extends Activity {
  predicted_before: number;
  predicted_after: number;
}

export interface ActivityFilters {
  query: string;
  category: ActivityCategory | "all";
  scheduleType: ScheduleType | "all";
  status: ActivityStatus | "all";
}

export const categoryLabels: Record<ActivityCategory, string> = {
  study: "Học tập",
  work: "Công việc",
  social: "Gặp gỡ",
  personal: "Cá nhân",
  rest: "Nghỉ ngơi",
};

export const scheduleLabels: Record<ScheduleType, string> = {
  fixed: "Cố định",
  flexible: "Linh hoạt",
};

export const statusLabels: Record<ActivityStatus, string> = {
  scheduled: "Sắp tới",
  completed: "Đã xong",
  skipped: "Đã nghỉ",
  cancelled: "Đã huỷ",
};

export const todoStatusLabels: Record<TodoStatus, string> = {
  pending: "Chưa xong",
  completed: "Đã xong",
  cancelled: "Đã huỷ",
};
