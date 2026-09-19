import { dateKey } from "@/lib/dates";
import type { EnergyRepository } from "@/lib/repository";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  ActionScope,
  Activity,
  ActivityChanges,
  ActivityDraft,
  ActivitySeries,
  DailyCheckin,
  Profile,
  Todo,
  TodoChanges,
  TodoDraft,
} from "@/lib/types";

function fail(message: string): never { throw new Error(message); }

const TODO_COLUMNS = "id,user_id,title,scheduled_date,due_at,status,note,activity_id,completed_at,overdue_acknowledged_at,created_at,updated_at";
const ACTIVITY_COLUMNS = "id,user_id,title,category,schedule_type,starts_at,ends_at,expected_impact,actual_energy_after,status,note,series_id,recurrence,occurrence_index,overdue_acknowledged_at,created_at,updated_at,activity_series!activities_series_owner_fkey(ends_on)";
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const OVERDUE_MATERIALIZATION_DAYS = 28;

type ActivityWithSeries = Omit<Activity, "recurrence_end_date"> & {
  activity_series?: { ends_on: string | null } | { ends_on: string | null }[] | null;
};

function migrationMessage(message: string): string {
  if (/activity_series(?:_exclusions)?|activities_series_(?:id|owner)_fkey|(?:create_recurring_activity|update_activity_scope|delete_activity_scope|delete_linked_activity_scope)|relationship[^\n]*activities[^\n]*activity_series/i.test(message)) {
    return "Lịch lặp chưa sẵn sàng. Hãy chạy lại supabase/migrations/005_activity_series_end.sql, làm mới schema cache của Supabase rồi thử lại.";
  }
  return message;
}

function mapActivity(value: unknown): Activity {
  const row = value as ActivityWithSeries;
  const relation = Array.isArray(row.activity_series) ? row.activity_series[0] : row.activity_series;
  const { activity_series: _relation, ...activity } = row;
  void _relation;
  return { ...activity, recurrence_end_date: relation?.ends_on ?? null };
}

function activityPayload(activity: Activity): Omit<Activity, "recurrence_end_date"> {
  const { recurrence_end_date: _end, ...payload } = activity;
  void _end;
  return payload;
}

function changePayload(changes: ActivityChanges): Omit<ActivityChanges, "recurrence_end_date"> {
  const { recurrence_end_date: _end, ...payload } = changes;
  void _end;
  return payload;
}

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

export class SupabaseRepository implements EnergyRepository {
  private client = getSupabaseBrowserClient();

  private async userId(): Promise<string> {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) return fail("Phiên đăng nhập đã hết hạn.");
    return data.user.id;
  }

  private async ensureSeriesSchema(): Promise<void> {
    const { error } = await this.client.from("activity_series").select("id").limit(1);
    if (error) fail(migrationMessage(error.message));
  }

  private async series(seriesId: string, userId: string): Promise<ActivitySeries> {
    const { data, error } = await this.client.from("activity_series").select("*").eq("id", seriesId).eq("user_id", userId).maybeSingle();
    if (error) fail(migrationMessage(error.message));
    if (!data) fail("Không tìm thấy chuỗi lịch để cập nhật.");
    return data as ActivitySeries;
  }

  private async materialize(from: string, to: string, userId: string): Promise<void> {
    await this.ensureSeriesSchema();
    const fromDate = dateKey(new Date(from));
    const { data, error } = await this.client.from("activity_series").select("*").eq("user_id", userId)
      .lte("anchor_starts_at", to).or(`ends_on.is.null,ends_on.gte.${fromDate}`);
    if (error) fail(migrationMessage(error.message));
    const seriesRows = (data ?? []) as ActivitySeries[];
    if (!seriesRows.length) return;

    const seriesIds = seriesRows.map((item) => item.id);
    const { data: excludedData, error: excludedError } = await this.client.from("activity_series_exclusions")
      .select("series_id,occurrence_index").eq("user_id", userId).in("series_id", seriesIds);
    if (excludedError) fail(migrationMessage(excludedError.message));
    const excluded = new Set((excludedData ?? []).map((item) => `${item.series_id}:${item.occurrence_index}`));
    const rows: Record<string, unknown>[] = [];
    for (const series of seriesRows) {
      const anchorStart = new Date(series.anchor_starts_at).getTime();
      const anchorEnd = new Date(series.anchor_ends_at).getTime();
      const first = Math.max(0, Math.ceil((new Date(from).getTime() - anchorEnd) / WEEK_MS));
      const last = Math.floor((new Date(to).getTime() - anchorStart) / WEEK_MS);
      for (let index = first; index <= last; index += 1) {
        const startsAt = new Date(anchorStart + index * WEEK_MS).toISOString();
        if ((series.ends_on && dateKey(new Date(startsAt)) > series.ends_on) || excluded.has(`${series.id}:${index}`)) continue;
        rows.push({
          user_id: userId, title: series.title, category: series.category, schedule_type: "fixed",
          starts_at: startsAt, ends_at: new Date(anchorEnd + index * WEEK_MS).toISOString(),
          expected_impact: series.expected_impact, actual_energy_after: null, status: "scheduled", note: series.note,
          series_id: series.id, recurrence: "weekly", occurrence_index: index, overdue_acknowledged_at: null,
        });
      }
    }
    if (!rows.length) return;
    // Avoid running insert triggers for already-materialized rows. Together with
    // the database row lock/check this prevents delete-vs-upsert deadlocks and
    // stale clients resurrecting excluded or out-of-range occurrences.
    const candidateIndexes = rows.map((row) => Number(row.occurrence_index));
    const { data: existingData, error: existingError } = await this.client.from("activities")
      .select("series_id,occurrence_index").eq("user_id", userId).in("series_id", seriesIds)
      .gte("occurrence_index", Math.min(...candidateIndexes)).lte("occurrence_index", Math.max(...candidateIndexes));
    if (existingError) fail(migrationMessage(existingError.message));
    const existing = new Set((existingData ?? []).map((item) => `${item.series_id}:${item.occurrence_index}`));
    const missingRows = rows.filter((row) => !existing.has(`${String(row.series_id)}:${Number(row.occurrence_index)}`));
    if (!missingRows.length) return;
    const { error: upsertError } = await this.client.from("activities").upsert(missingRows, {
      onConflict: "user_id,series_id,occurrence_index",
      ignoreDuplicates: true,
    });
    if (upsertError) fail(migrationMessage(upsertError.message));
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
    const { data, error } = await this.client.from("activities").select(ACTIVITY_COLUMNS).eq("user_id", userId).eq("id", activityId).maybeSingle();
    if (error) return fail(migrationMessage(error.message));
    return data ? mapActivity(data) : null;
  }

  async getTodoByActivity(activityId: string): Promise<Todo | null> {
    const userId = await this.userId();
    const { data, error } = await this.client.from("todos").select(TODO_COLUMNS).eq("user_id", userId).eq("activity_id", activityId).maybeSingle();
    if (error) return fail(error.message);
    return data as Todo | null;
  }

  async listActivities(from: string, to: string): Promise<Activity[]> {
    const userId = await this.userId();
    await this.materialize(from, to, userId);
    const { data, error } = await this.client.from("activities").select(ACTIVITY_COLUMNS).eq("user_id", userId)
      .lte("starts_at", to).gte("ends_at", from).order("starts_at");
    if (error) return fail(migrationMessage(error.message));
    return (data ?? []).map(mapActivity);
  }

  async listOverdueActivities(before: string): Promise<Activity[]> {
    const userId = await this.userId();
    const beforeTime = new Date(before).getTime();
    if (!Number.isFinite(beforeTime)) fail("Mốc thời gian kiểm tra quá hạn không hợp lệ.");
    // Product policy: only materialize the bounded 28-day historical backlog.
    const historicalFrom = new Date(beforeTime - OVERDUE_MATERIALIZATION_DAYS * DAY_MS).toISOString();
    await this.materialize(historicalFrom, before, userId);
    const { data, error } = await this.client.from("activities").select(ACTIVITY_COLUMNS).eq("user_id", userId)
      .eq("status", "scheduled").is("overdue_acknowledged_at", null).lt("ends_at", before).gte("ends_at", historicalFrom).order("ends_at");
    if (error) return fail(migrationMessage(error.message));
    return (data ?? []).map(mapActivity);
  }

  async createActivity(draft: ActivityDraft): Promise<Activity[]> {
    const userId = await this.userId();
    await this.ensureSeriesSchema();
    const recurring = draft.schedule_type === "fixed" && draft.recurrence === "weekly";
    const endsOn = recurring ? draft.recurrence_end_date : null;
    if (endsOn && endsOn < dateKey(new Date(draft.starts_at))) fail("Ngày kết thúc lặp cần bằng hoặc sau ngày bắt đầu.");
    if (recurring) {
      const { data, error } = await this.client.rpc("create_recurring_activity", { p_draft: draft });
      if (error) fail(migrationMessage(error.message));
      return [{ ...(data as Omit<Activity, "recurrence_end_date">), recurrence_end_date: endsOn }];
    }
    const { recurrence_end_date: _end, ...cleanDraft } = draft;
    void _end;
    const row = {
      ...cleanDraft, user_id: userId, recurrence: "none", series_id: null, occurrence_index: 0, overdue_acknowledged_at: null,
    };
    const { data, error } = await this.client.from("activities").insert(row).select(ACTIVITY_COLUMNS).single();
    if (error) return fail(migrationMessage(error.message));
    return [mapActivity(data)];
  }

  async updateActivity(activity: Activity, changes: ActivityChanges, scope: ActionScope): Promise<void> {
    const userId = await this.userId();
    await this.ensureSeriesSchema();
    const makeRecurring = !activity.series_id
      && (changes.schedule_type ?? activity.schedule_type) === "fixed"
      && changes.recurrence === "weekly";
    const detachRecurring = Boolean(activity.series_id)
      && (changes.schedule_type === "flexible" || changes.recurrence === "none");
    const validateSeriesEndAgainstMaster = Boolean(activity.series_id)
      && changes.recurrence_end_date !== undefined;
    if (makeRecurring || (activity.series_id && (validateSeriesEndAgainstMaster || detachRecurring || scope !== "single"))) {
      const { error } = await this.client.rpc("update_activity_scope", {
        p_activity_id: activity.id,
        p_changes: changes,
        p_scope: scope,
      });
      if (error) fail(migrationMessage(error.message));
      return;
    }
    if (!activity.series_id) {
      const makeRecurring = (changes.schedule_type ?? activity.schedule_type) === "fixed" && changes.recurrence === "weekly";
      if (makeRecurring) {
        const startsAt = changes.starts_at ?? activity.starts_at;
        const endsAt = changes.ends_at ?? activity.ends_at;
        const endsOn = changes.recurrence_end_date ?? null;
        if (endsOn && endsOn < dateKey(new Date(startsAt))) fail("Ngày kết thúc lặp cần bằng hoặc sau ngày bắt đầu.");
        const { data: createdSeries, error: seriesError } = await this.client.from("activity_series").insert({
          user_id: userId, title: changes.title ?? activity.title, category: changes.category ?? activity.category,
          schedule_type: "fixed", anchor_starts_at: startsAt, anchor_ends_at: endsAt,
          expected_impact: changes.expected_impact ?? activity.expected_impact, note: changes.note ?? activity.note, ends_on: endsOn,
        }).select("id").single();
        if (seriesError) fail(migrationMessage(seriesError.message));
        const recurring = { ...changePayload(changes), schedule_type: "fixed", recurrence: "weekly", series_id: createdSeries.id, occurrence_index: 0 };
        const { data, error } = await this.client.from("activities").update(recurring).eq("id", activity.id).eq("user_id", userId).select("id").maybeSingle();
        if (error || !data) {
          await this.client.from("activity_series").delete().eq("id", createdSeries.id).eq("user_id", userId);
          if (error) fail(migrationMessage(error.message));
          fail("Không tìm thấy hoạt động để cập nhật.");
        }
        return;
      }
      const normalized: ActivityChanges = changes.schedule_type === "flexible" || changes.recurrence === "none"
        ? { ...changes, recurrence: "none", recurrence_end_date: null }
        : changes;
      const { data, error } = await this.client.from("activities").update(changePayload(normalized)).eq("id", activity.id).eq("user_id", userId).select("id").maybeSingle();
      if (error) fail(migrationMessage(error.message));
      if (!data) fail("Không tìm thấy hoạt động để cập nhật.");
      return;
    }

    const series = await this.series(activity.series_id, userId);
    const detach = changes.schedule_type === "flexible" || changes.recurrence === "none";
    let targetQuery = this.client.from("activities").select(ACTIVITY_COLUMNS).eq("user_id", userId).eq("series_id", series.id);
    if (scope === "single") targetQuery = targetQuery.eq("id", activity.id);
    if (scope === "future") targetQuery = targetQuery.gte("occurrence_index", activity.occurrence_index);
    const { data: targetData, error: targetError } = await targetQuery.order("occurrence_index");
    if (targetError) fail(migrationMessage(targetError.message));
    const targets = (targetData ?? []).map(mapActivity);
    if (!targets.length) fail("Không tìm thấy hoạt động để cập nhật.");

    if (detach) {
      if (scope === "all") {
        const resultSchedule = changes.schedule_type ?? activity.schedule_type;
        const rows = targets.map((target) => activityPayload({ ...target, ...changesForOccurrence(target, activity, changes), schedule_type: resultSchedule, series_id: null, recurrence: "none", recurrence_end_date: null, occurrence_index: 0 }));
        const { error } = await this.client.from("activities").upsert(rows, { onConflict: "id" });
        if (error) fail(migrationMessage(error.message));
        const deleted = await this.client.from("activity_series").delete().eq("id", series.id).eq("user_id", userId);
        if (deleted.error) {
          const rollback = await this.client.from("activities").upsert(targets.map(activityPayload), { onConflict: "id" });
          if (rollback.error) fail(`Không thể xoá series và cũng chưa thể khôi phục occurrence: ${rollback.error.message}`);
          fail(migrationMessage(deleted.error.message));
        }
        return;
      }
      const exclusion = await this.client.from("activity_series_exclusions").upsert({ user_id: userId, series_id: series.id, occurrence_index: activity.occurrence_index }, { onConflict: "series_id,occurrence_index", ignoreDuplicates: true });
      if (exclusion.error) fail(migrationMessage(exclusion.error.message));
      try {
        const detached = { ...activity, ...changesForOccurrence(activity, activity, changes), schedule_type: changes.schedule_type ?? activity.schedule_type, series_id: null, recurrence: "none" as const, recurrence_end_date: null, occurrence_index: 0 };
        const detachedResult = await this.client.from("activities").upsert(activityPayload(detached), { onConflict: "id" });
        if (detachedResult.error) throw new Error(migrationMessage(detachedResult.error.message));
        if (scope === "future") {
          const futureIds = targets.filter((target) => target.id !== activity.id).map((target) => target.id);
          if (futureIds.length) {
            const removed = await this.client.from("activities").delete().eq("user_id", userId).in("id", futureIds);
            if (removed.error) throw new Error(migrationMessage(removed.error.message));
          }
          if (activity.occurrence_index === 0) {
            const deleted = await this.client.from("activity_series").delete().eq("id", series.id).eq("user_id", userId);
            if (deleted.error) throw new Error(migrationMessage(deleted.error.message));
          } else {
            const truncated = await this.client.from("activity_series").update({ ends_on: cutoffBefore(series, activity.occurrence_index) }).eq("id", series.id).eq("user_id", userId);
            if (truncated.error) throw new Error(migrationMessage(truncated.error.message));
          }
        }
      } catch (reason) {
        const rollback = await this.client.from("activities").upsert(targets.map(activityPayload), { onConflict: "id" });
        await this.client.from("activity_series_exclusions").delete().eq("user_id", userId).eq("series_id", series.id).eq("occurrence_index", activity.occurrence_index);
        if (rollback.error) fail(`Không thể cập nhật series và cũng chưa thể khôi phục occurrence: ${rollback.error.message}`);
        throw reason;
      }
      return;
    }

    if (scope === "future") {
      const newSeries = {
        user_id: userId, title: changes.title ?? activity.title, category: changes.category ?? activity.category,
        schedule_type: "fixed" as const, anchor_starts_at: changes.starts_at ?? activity.starts_at,
        anchor_ends_at: changes.ends_at ?? activity.ends_at, expected_impact: changes.expected_impact ?? activity.expected_impact,
        note: changes.note ?? activity.note, ends_on: changes.recurrence_end_date === undefined ? series.ends_on : changes.recurrence_end_date,
      };
      const { data: futureExclusions, error: exclusionError } = await this.client.from("activity_series_exclusions")
        .select("occurrence_index").eq("user_id", userId).eq("series_id", series.id).gte("occurrence_index", activity.occurrence_index);
      if (exclusionError) fail(migrationMessage(exclusionError.message));
      let insertedId: string | null = null;
      try {
        const { data: inserted, error: insertError } = await this.client.from("activity_series").insert(newSeries).select("id,ends_on").single();
        if (insertError) throw new Error(migrationMessage(insertError.message));
        const newSeriesId = inserted.id as string;
        insertedId = newSeriesId;
        const rows = targets.map((target) => activityPayload({
          ...target, ...changesForOccurrence(target, activity, changes), schedule_type: "fixed", series_id: newSeriesId,
          recurrence: "weekly", recurrence_end_date: inserted.ends_on as string | null,
          occurrence_index: target.occurrence_index - activity.occurrence_index,
        }));
        const moved = await this.client.from("activities").upsert(rows, { onConflict: "id" });
        if (moved.error) throw new Error(migrationMessage(moved.error.message));
        const branchFinalIndex = finalOccurrenceIndex({ ...series, ...newSeries, id: newSeriesId, ends_on: inserted.ends_on as string | null });
        if (branchFinalIndex !== null) {
          const pruned = await this.client.from("activities").delete().eq("user_id", userId).eq("series_id", newSeriesId).gt("occurrence_index", branchFinalIndex);
          if (pruned.error) throw new Error(migrationMessage(pruned.error.message));
        }
        if (futureExclusions?.length) {
          const transferred = await this.client.from("activity_series_exclusions").upsert(futureExclusions.map((item) => ({
            user_id: userId, series_id: newSeriesId, occurrence_index: item.occurrence_index - activity.occurrence_index,
          })), { onConflict: "series_id,occurrence_index", ignoreDuplicates: true });
          if (transferred.error) throw new Error(migrationMessage(transferred.error.message));
        }
        if (activity.occurrence_index === 0) {
          const deleted = await this.client.from("activity_series").delete().eq("id", series.id).eq("user_id", userId);
          if (deleted.error) throw new Error(migrationMessage(deleted.error.message));
        } else {
          const truncated = await this.client.from("activity_series").update({ ends_on: cutoffBefore(series, activity.occurrence_index) }).eq("id", series.id).eq("user_id", userId);
          if (truncated.error) throw new Error(migrationMessage(truncated.error.message));
          await this.client.from("activity_series_exclusions").delete()
            .eq("user_id", userId).eq("series_id", series.id).gte("occurrence_index", activity.occurrence_index);
        }
      } catch (reason) {
        if (insertedId) {
          const rollback = await this.client.from("activities").upsert(targets.map(activityPayload), { onConflict: "id" });
          await this.client.from("activity_series").delete().eq("id", insertedId).eq("user_id", userId);
          if (rollback.error) fail(`Không thể tách series và cũng chưa thể khôi phục occurrence: ${rollback.error.message}`);
        }
        throw reason;
      }
      return;
    }

    if (scope === "all") {
      const startDelta = changes.starts_at ? new Date(changes.starts_at).getTime() - new Date(activity.starts_at).getTime() : 0;
      const endDelta = changes.ends_at ? new Date(changes.ends_at).getTime() - new Date(activity.ends_at).getTime() : 0;
      const seriesChanges = {
        title: changes.title ?? series.title, category: changes.category ?? series.category,
        anchor_starts_at: new Date(new Date(series.anchor_starts_at).getTime() + startDelta).toISOString(),
        anchor_ends_at: new Date(new Date(series.anchor_ends_at).getTime() + endDelta).toISOString(),
        expected_impact: changes.expected_impact ?? series.expected_impact, note: changes.note ?? series.note,
        ends_on: changes.recurrence_end_date === undefined ? series.ends_on : changes.recurrence_end_date,
      };
      const seriesSnapshot = {
        title: series.title, category: series.category, anchor_starts_at: series.anchor_starts_at,
        anchor_ends_at: series.anchor_ends_at, expected_impact: series.expected_impact, note: series.note, ends_on: series.ends_on,
      };
      const updatedSeries = await this.client.from("activity_series").update(seriesChanges).eq("id", series.id).eq("user_id", userId);
      if (updatedSeries.error) fail(migrationMessage(updatedSeries.error.message));
      const rows = targets.map((target) => activityPayload({ ...target, ...changesForOccurrence(target, activity, changes), recurrence: "weekly", recurrence_end_date: seriesChanges.ends_on }));
      const updatedRows = await this.client.from("activities").upsert(rows, { onConflict: "id" });
      if (updatedRows.error) {
        await this.client.from("activity_series").update(seriesSnapshot).eq("id", series.id).eq("user_id", userId);
        fail(migrationMessage(updatedRows.error.message));
      }
      const finalIndex = finalOccurrenceIndex({ ...series, ...seriesChanges });
      if (finalIndex !== null) {
        const removed = await this.client.from("activities").delete().eq("user_id", userId).eq("series_id", series.id)
          .gt("occurrence_index", finalIndex);
        if (removed.error) {
          await this.client.from("activity_series").update(seriesSnapshot).eq("id", series.id).eq("user_id", userId);
          const rollback = await this.client.from("activities").upsert(targets.map(activityPayload), { onConflict: "id" });
          if (rollback.error) fail(`Không thể cập nhật toàn bộ series và cũng chưa thể khôi phục occurrence: ${rollback.error.message}`);
          fail(migrationMessage(removed.error.message));
        }
      }
      return;
    }

    const singleChanges = changePayload(changesForOccurrence(activity, activity, changes));
    const { data, error } = await this.client.from("activities").update(singleChanges).eq("id", activity.id).eq("user_id", userId).select("id").maybeSingle();
    if (error) fail(migrationMessage(error.message));
    if (!data) fail("Không tìm thấy hoạt động để cập nhật.");
  }

  async deleteActivity(activity: Activity, scope: ActionScope): Promise<void> {
    await this.userId();
    await this.ensureSeriesSchema();
    const { error } = await this.client.rpc("delete_activity_scope", { p_activity_id: activity.id, p_scope: scope });
    if (error) fail(migrationMessage(error.message));
  }

  async listTodos(fromDate?: string, toDate?: string): Promise<Todo[]> {
    if ((fromDate === undefined) !== (toDate === undefined)) return fail("Khoảng ngày việc cần làm phải có đủ ngày bắt đầu và kết thúc.");
    const userId = await this.userId();
    let query = this.client.from("todos").select(TODO_COLUMNS).eq("user_id", userId);
    if (fromDate !== undefined && toDate !== undefined) query = query.gte("scheduled_date", fromDate).lte("scheduled_date", toDate);
    const { data, error } = await query.order("scheduled_date", { ascending: true, nullsFirst: true }).order("due_at", { ascending: true, nullsFirst: true }).order("created_at").order("id");
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
    const { data, error } = await this.client.from("todos").insert({ ...draft, user_id: userId, status: "pending", completed_at: null, overdue_acknowledged_at: null }).select(TODO_COLUMNS).single();
    if (error) return fail(error.message);
    return data as Todo;
  }

  async updateTodo(todo: Todo, changes: TodoChanges): Promise<Todo> {
    const userId = await this.userId();
    const payload: TodoChanges = { ...changes };
    if (changes.status !== undefined) payload.completed_at = changes.status === "completed" ? changes.completed_at === undefined ? todo.completed_at ?? new Date().toISOString() : changes.completed_at : null;
    if (changes.overdue_acknowledged_at === undefined && (changes.scheduled_date !== undefined || changes.due_at !== undefined || changes.status === "pending")) payload.overdue_acknowledged_at = null;
    const { data, error } = await this.client.from("todos").update(payload).eq("id", todo.id).eq("user_id", userId).select(TODO_COLUMNS).maybeSingle();
    if (error) return fail(error.message);
    if (!data) return fail("Không tìm thấy việc cần làm để cập nhật.");
    return data as Todo;
  }

  async deleteLinkedTodo(todo: Todo, activity: Activity, scope: ActionScope): Promise<void> {
    await this.userId();
    await this.ensureSeriesSchema();
    const { error } = await this.client.rpc("delete_linked_activity_scope", {
      p_todo_id: todo.id,
      p_activity_id: activity.id,
      p_scope: scope,
    });
    if (error) fail(migrationMessage(error.message));
  }

  async deleteTodo(todo: Todo): Promise<void> {
    const userId = await this.userId();
    const { data, error } = await this.client.from("todos").delete().eq("id", todo.id).eq("user_id", userId).select("id");
    if (error) fail(error.message);
    if (!data?.length) fail("Không tìm thấy việc cần làm để xoá.");
  }
}
