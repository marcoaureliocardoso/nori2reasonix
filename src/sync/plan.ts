import type { DiffEntry } from "../doctor/diff.js";

export type SyncActionKind = "emit" | "re-emit" | "remove";

export interface SyncAction {
  skill: string;
  action: SyncActionKind;
}

/**
 * Turn a diff into a sync action plan.
 * shadowed is not auto-fixable → left out (surfaced as a warning upstream).
 */
export function planSync(entries: DiffEntry[]): SyncAction[] {
  const actions: SyncAction[] = [];
  for (const entry of entries) {
    switch (entry.status) {
      case "missing":
        actions.push({ skill: entry.skill, action: "emit" });
        break;
      case "drift":
        actions.push({ skill: entry.skill, action: "re-emit" });
        break;
      case "stale":
        actions.push({ skill: entry.skill, action: "remove" });
        break;
      case "ok":
      case "shadowed":
        break;
    }
  }
  return actions;
}
