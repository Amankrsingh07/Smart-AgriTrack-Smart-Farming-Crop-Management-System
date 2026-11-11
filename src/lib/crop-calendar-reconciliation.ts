type ExistingActivity = { activityKey: string; status: string };
type GeneratedActivity = { activityKey: string };

/** Unique activity keys make regeneration deterministic and preserve completed history. */
export function reconcileCropCalendarActivities<T extends GeneratedActivity, E extends ExistingActivity>(existing: E[], generated: T[]) {
  const existingByKey = new Map(existing.map(item => [item.activityKey, item]));
  const keys = new Set(generated.map(item => item.activityKey));
  return {
    toUpsert: generated.filter(item => existingByKey.get(item.activityKey)?.status !== "COMPLETED"),
    preserveCompleted: existing.filter(item => item.status === "COMPLETED"),
    removeObsoletePending: existing.filter(item => item.status !== "COMPLETED" && !keys.has(item.activityKey)),
  };
}
