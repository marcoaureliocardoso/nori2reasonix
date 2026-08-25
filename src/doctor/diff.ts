export type DiffStatus = "ok" | "missing" | "stale" | "drift" | "shadowed";

export interface DiffEntry {
  skill: string;
  status: DiffStatus;
  detail: string;
}

/** Side A: expected skills from Nori source (name → hash). */
export interface SourceSide {
  skills: Record<string, { hash: string }>;
}

/** Side B: skills actually loaded by the target (name → path + hash). */
export interface TargetSide {
  skills: Map<string, { path: string; hash: string }>;
}

/**
 * Diff the expected Nori skills against the skills the target actually
 * loads, producing a status per skill name (union of both sides).
 */
export function diffSkillsets(
  source: SourceSide,
  target: TargetSide
): DiffEntry[] {
  const names = new Set([
    ...Object.keys(source.skills),
    ...target.skills.keys(),
  ]);

  const entries: DiffEntry[] = [];
  for (const name of names) {
    const src = source.skills[name];
    const tgt = target.skills.get(name);

    if (src !== undefined && tgt === undefined) {
      entries.push({
        skill: name,
        status: "missing",
        detail: "present in Nori source but not loaded by the target",
      });
    } else if (src === undefined && tgt !== undefined) {
      entries.push({
        skill: name,
        status: "stale",
        detail: "loaded by the target but absent from the active Nori source",
      });
    } else if (src!.hash !== tgt!.hash) {
      entries.push({
        skill: name,
        status: "drift",
        detail: "content differs between source and target",
      });
    } else {
      entries.push({ skill: name, status: "ok", detail: "in sync" });
    }
  }

  return entries;
}
