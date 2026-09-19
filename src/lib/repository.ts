import type {
  ActionScope,
  Activity,
  ActivityChanges,
  ActivityDraft,
  DailyCheckin,
  Profile,
  Todo,
  TodoChanges,
  TodoDraft,
} from "@/lib/types";

export interface EnergyRepository {
  getProfile(): Promise<Profile>;
  saveProfile(profile: Pick<Profile, "display_name" | "default_energy">): Promise<Profile>;
  getCheckin(date: string): Promise<DailyCheckin | null>;
  listCheckins(fromDate: string, toDate: string): Promise<DailyCheckin[]>;
  saveCheckin(date: string, energy: number, note: string): Promise<DailyCheckin>;
  getActivity(id: string): Promise<Activity | null>;
  getTodoByActivity(activityId: string): Promise<Todo | null>;
  listActivities(from: string, to: string): Promise<Activity[]>;
  listOverdueActivities(before: string): Promise<Activity[]>;
  createActivity(draft: ActivityDraft): Promise<Activity[]>;
  updateActivity(activity: Activity, changes: ActivityChanges, scope: ActionScope): Promise<void>;
  deleteActivity(activity: Activity, scope: ActionScope): Promise<void>;
  listTodos(fromDate?: string, toDate?: string): Promise<Todo[]>;
  listOverdueTodos(todayDate: string, nowIso: string): Promise<Todo[]>;
  createTodo(draft: TodoDraft): Promise<Todo>;
  updateTodo(todo: Todo, changes: TodoChanges): Promise<Todo>;
  deleteTodo(todo: Todo): Promise<void>;
  deleteLinkedTodo(todo: Todo, activity: Activity, scope: ActionScope): Promise<void>;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
