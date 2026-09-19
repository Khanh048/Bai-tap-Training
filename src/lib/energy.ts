import type { Activity, ForecastActivity } from "@/lib/types";

export const DEFAULT_ENERGY = 70;

export function clampEnergy(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export type EnergyBand = "low" | "medium" | "high";

export function energyBand(value: number): EnergyBand {
  const energy = clampEnergy(value);
  return energy < 30 ? "low" : energy < 60 ? "medium" : "high";
}

export function compareActivitiesByImpactTime(
  left: Pick<Activity, "ends_at" | "starts_at" | "id">,
  right: Pick<Activity, "ends_at" | "starts_at" | "id">,
): number {
  return left.ends_at.localeCompare(right.ends_at)
    || left.starts_at.localeCompare(right.starts_at)
    || left.id.localeCompare(right.id);
}

export function forecastActivities(activities: Activity[], initialEnergy = DEFAULT_ENERGY): ForecastActivity[] {
  let current = clampEnergy(initialEnergy);
  return [...activities]
    .sort(compareActivitiesByImpactTime)
    .map((activity) => {
      const predictedBefore = current;
      if (activity.status !== "skipped" && activity.status !== "cancelled") {
        current = activity.status === "completed" && activity.actual_energy_after !== null
          ? clampEnergy(activity.actual_energy_after)
          : clampEnergy(current + activity.expected_impact);
      }
      return { ...activity, predicted_before: predictedBefore, predicted_after: current };
    });
}

export function endOfDayEnergy(activities: Activity[], initialEnergy = DEFAULT_ENERGY): number {
  const forecast = forecastActivities(activities, initialEnergy);
  return forecast.at(-1)?.predicted_after ?? clampEnergy(initialEnergy);
}

export function hasOverlap(candidate: Pick<Activity, "starts_at" | "ends_at" | "id">, activities: Activity[]): boolean {
  const start = new Date(candidate.starts_at).getTime();
  const end = new Date(candidate.ends_at).getTime();
  return activities.some((item) =>
    item.id !== candidate.id &&
    item.status !== "cancelled" &&
    item.status !== "skipped" &&
    start < new Date(item.ends_at).getTime() &&
    end > new Date(item.starts_at).getTime(),
  );
}
