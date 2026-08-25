import type { DiffEntry } from "../doctor/diff.js";

/**
 * Collect skill names that qualify as "Nori-owned" candidates for cleanup:
 * everything recorded in ownership (we wrote it) plus any diff entry marked
 * stale/drift (they differ from or are absent in the active Nori source).
 *
 * `missing` (not present in target) and `shadowed` (scope decision) are not
 * cleanup candidates.
 */
export function planClean(
  ownedSkills: ReadonlySet<string>,
  diff: DiffEntry[]
): string[] {
  const candidates = new Set<string>(ownedSkills);

  for (const entry of diff) {
    if (entry.status === "stale" || entry.status === "drift") {
      candidates.add(entry.skill);
    }
  }

  return [...candidates];
}
