import { addWeeks } from "date-fns";
import type { EnergyRepository } from "@/lib/repository";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
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

function fail(message: string): never { throw new Error(message); }

const TODO_COLUMNS = "id,user_id,title,scheduled_date,due_at,status,note,activity_id,completed_at,overdue_acknowledged_at,created_at,updated_at";

function changesForOccurrence(target: Activity, source: Activity, changes: ActivityChanges): ActivityChanges {
  const result = { ...changes };
  if (changes.starts_at && target.id !== source.id) {
    const delta = new Date(changes.starts_at).getTime() - new Date(source.starts_at).getTime();
    result.starts_at = new Date(new Date(target.starts_at).getTime() + delta).toISOString();
  }
  if (changes.ends_at && target.id !== source.id) {
    const delta = new Date(changes.ends_at).getTime() - new Date(source.ends_at).getTime();
    result.ends_at = new Date(new Date(target.ends_at).getTime() + delta).toISOString();
  }
  if (result.status && result.status !== "completed") result.actual_energy_after = null;
  return result;
}

export class SupabaseRepository implements EnergyRepository {
  private client = getSupabaseBrowserClient();

  private async userId(): Promise<string> {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) return fail("Phiên đăng nhập đã hết hạn.");
    return data.user.id;
  }

  async getProfile(): Promise<Profile> {
    const { data: authData, error: authError } = await this.client.auth.getUser();
    if (authError || !authData.user) return fail("Phiên đăng nhập đã hết hạn.");
    const user = authData.user;
    const { data, error } = await this.client.from("profiles").select("id,display_name,default_energy").eq("id", user.id).maybeSingle();
    if (error) return fail(error.message);
    if (data) return data as Profile;

    const metadataName = typeof user.user_metadata?.display_name === "string" ? user.user_metadata.display_name.trim() : "";
    const emailName = user.email?.split("@")[0]?.trim() ?? "";
    const { data: created, error: createError } = await this.client.from("profiles")
      .upsert({ id: user.id, display_name: metadataName || emailName || "Bạn", default_energy: 70 }, { onConflict: "id" })
      .select("id,display_name,default_energy").single();
    if (createError) return fail(createError.message);
    return created as Profile;
  }

  async saveProfile(profile: Pick<Profile, "display_name" | "default_energy">): Promise<Profile> {
    const userId = await this.userId();
    const { data, error } = await this.client.from("profiles").upsert({ id: userId, ...profile }).select().single();
    if (error) return fail(error.message);
    return data as Profile;
  }

  async getCheckin(date: string): Promise<DailyCheckin | null> {
    const userId = await this.userId();
    const { data, error } = await this.client.from("daily_checkins").select("*").eq("user_id", userId).eq("checkin_date", date).maybeSingle();
    if (error) return fail(error.message);
    return data as DailyCheckin | null;
  }

  async listCheckins(fromDate: string, toDate: string): Promise<DailyCheckin[]> {
    const userId = await this.userId();
    const { data, error } = await this.client.from("daily_checkins").select("*").eq("user_id", userId).gte("checkin_date", fromDate).lte("checkin_date", toDate);
    if (error) return fail(error.message);
    return (data ?? []) as DailyCheckin[];
  }

  async saveCheckin(date: string, energy: number, note: string): Promise<DailyCheckin> {
    const userId = await this.userId();
    const { data, error } = await this.client.from("daily_checkins")
      .upsert({ user_id: userId, checkin_date: date, energy_level: energy, note }, { onConflict: "user_id,checkin_date" })
      .select().single();
    if (error) return fail(error.message);
    return data as DailyCheckin;
  }

  async getActivity(activityId: string): Promise<Activity | null> {
    const userId = await this.userId();
    const { data, error } = await this.client.from("activities").select("*").eq("user_id", userId).eq("id", activityId).maybeSingle();
    if (error) return fail(error.message);
    return data as Activity | null;
  }

  async getTodoByActivity(activityId: string): Promise<Todo | null> {
    const userId = await this.userId();
    const { data, error } = await this.client.from("todos").select(TODO_COLUMNS).eq("user_id", userId).eq("activity_id", activityId).maybeSingle();
    if (error) return fail(error.message);
    return data as Todo | null;
  }

  async listActivities(from: string, to: string): Promise<Activity[]> {
    const userId = await this.userId();
    const { data, error } = await this.client.from("activities").select("*").eq("user_id", userId)
      .lte("starts_at", to).gte("ends_at", from).order("starts_at");
    if (error) return fail(error.message);
    return (data ?? []) as Activity[];
  }

  async listOverdueActivities(before: string): Promise<Activity[]> {
    const userId = await this.userId();
    const { data, error } = await this.client.from("activities").select("*").eq("user_id", userId)
      .eq("status", "scheduled").is("overdue_acknowledged_at", null).lt("ends_at", before).order("ends_at");
    if (error) return fail(error.message);
    return (data ?? []) as Activity[];
  }

  async createActivity(draft: ActivityDraft): Promise<Activity[]> {
    const userId = await this.userId();
    const seriesId = draft.recurrence === "weekly" ? crypto.randomUUID() : null;
    const count = draft.recurrence === "weekly" ? 12 : 1;
    const rows = Array.from({ length: count }, (_, index) => ({
      ...draft,
      user_id: userId,
      starts_at: addWeeks(new Date(draft.starts_at), index).toISOString(),
      ends_at: addWeeks(new Date(draft.ends_at), index).toISOString(),
      series_id: seriesId,
      occurrence_index: index,
      overdue_acknowledged_at: null,
    }));
    const { data, error } = await this.client.from("activities").insert(rows).select();
    if (error) return fail(error.message);
    return (data ?? []) as Activity[];
  }

  async updateActivity(activity: Activity, changes: ActivityChanges, scope: ActionScope): Promise<void> {
    const userId = await this.userId();
    let query = this.client.from("activities").select("*").eq("user_id", userId);
    if (scope === "single" || !activity.series_id) query = query.eq("id", activity.id);
    else {
      query = query.eq("series_id", activity.series_id);
      if (scope === "future") query = query.gte("occurrence_index", activity.occurrence_index);
    }
    const result = await query.order("occurrence_index");
    if (result.error) return fail(result.error.message);
    const targets = (result.data ?? []) as Activity[];
    if (!targets.length) return fail("Không tìm thấy hoạt động để cập nhật.");

    const rows: Activity[] = targets.map((target) => ({
      ...target,
      ...changesForOccurrence(target, activity, changes),
      id: target.id,
      user_id: userId,
      series_id: target.series_id,
      recurrence: target.recurrence,
      occurrence_index: target.occurrence_index,
      created_at: target.created_at,
    }));
    const { error } = await this.client.from("activities").upsert(rows, { onConflict: "id" });
    if (error) fail(error.message);
  }

  async deleteActivity(activity: Activity, scope: ActionScope): Promise<void> {
    const userId = await this.userId();
    let query = this.client.from("activities").delete().eq("user_id", userId);
    if (scope === "single" || !activity.series_id) query = query.eq("id", activity.id);
    else {
      query = query.eq("series_id", activity.series_id);
      if (scope === "future") query = query.gte("occurrence_index", activity.occurrence_index);
    }
    const { data, error } = await query.select("id");
    if (error) fail(error.message);
    if (!data?.length) fail("Không tìm thấy hoạt động để xoá.");
  }

  async listTodos(fromDate?: string, toDate?: string): Promise<Todo[]> {
    if ((fromDate === undefined) !== (toDate === undefined)) {
      return fail("Khoảng ngày việc cần làm phải có đủ ngày bắt đầu và kết thúc.");
    }
    const userId = await this.userId();
    let query = this.client.from("todos").select(TODO_COLUMNS).eq("user_id", userId);
    if (fromDate !== undefined && toDate !== undefined) {
      query = query.gte("scheduled_date", fromDate).lte("scheduled_date", toDate);
    }
    const { data, error } = await query
      .order("scheduled_date", { ascending: true, nullsFirst: true })
      .order("due_at", { ascending: true, nullsFirst: true })
      .order("created_at")
      .order("id");
    if (error) return fail(error.message);
    return (data ?? []) as Todo[];
  }

  async listOverdueTodos(todayDate: string, nowIso: string): Promise<Todo[]> {
    const userId = await this.userId();
    const { data, error } = await this.client.from("todos").select(TODO_COLUMNS).eq("user_id", userId)
      .eq("status", "pending").is("activity_id", null).is("overdue_acknowledged_at", null)
      .or(`due_at.lt.${nowIso},and(due_at.is.null,scheduled_date.lt.${todayDate})`)
      .order("scheduled_date").order("due_at", { ascending: true, nullsFirst: true });
    if (error) return fail(error.message);
    return (data ?? []) as Todo[];
  }

  async createTodo(draft: TodoDraft): Promise<Todo> {
    const userId = await this.userId();
    const { data, error } = await this.client.from("todos").insert({
      ...draft,
      user_id: userId,
      status: "pending",
      completed_at: null,
      overdue_acknowledged_at: null,
    }).select(TODO_COLUMNS).single();
    if (error) return fail(error.message);
    return data as Todo;
  }

  async updateTodo(todo: Todo, changes: TodoChanges): Promise<Todo> {
    const userId = await this.userId();
    const payload: TodoChanges = { ...changes };
    if (changes.status !== undefined) {
      payload.completed_at = changes.status === "completed"
        ? changes.completed_at === undefined ? todo.completed_at ?? new Date().toISOString() : changes.completed_at
        : null;
    }
    if (changes.overdue_acknowledged_at === undefined
      && (changes.scheduled_date !== undefined || changes.due_at !== undefined || changes.status === "pending")) {
      payload.overdue_acknowledged_at = null;
    }
    const { data, error } = await this.client.from("todos").update(payload)
      .eq("id", todo.id).eq("user_id", userId).select(TODO_COLUMNS).maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Không tìm thấy việc cần làm để cập nhật.");
    return data as Todo;
  }

  async deleteLinkedTodo(todo: Todo, activity: Activity): Promise<void> {
    const { error } = await this.client.rpc("delete_linked_todo", { p_todo_id: todo.id, p_activity_id: activity.id });
    if (error) fail(error.message);
  }

  async deleteTodo(todo: Todo): Promise<void> {
    const userId = await this.userId();
    const { data, error } = await this.client.from("todos").delete()
      .eq("id", todo.id).eq("user_id", userId).select("id");
    if (error) fail(error.message);
    if (!data?.length) fail("Không tìm thấy việc cần làm để xoá.");
  }
}
