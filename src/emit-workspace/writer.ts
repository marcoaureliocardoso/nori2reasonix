import path from "node:path";
import { writeOwned } from "../emit/ownership.js";
import type { PlannedFile } from "./plan.js";

export interface WriteResult {
  written: string[];
  skipped: string[];
}

/**
 * Write planned workspace files with ownership tracking (`.nori2reasonix.json`).
 * Idempotent: files we own are rewritten; user files are never overwritten.
 */
export function writeWorkspace(plan: PlannedFile[]): WriteResult {
  const root = commonRoot(plan);
  return writeOwned(plan, root);
}

function commonRoot(plan: PlannedFile[]): string {
  if (plan.length === 0) return ".";
  const first = plan[0]!.path.split(path.sep);
  let common: string[] = first;
  for (const file of plan.slice(1)) {
    const parts = file.path.split(path.sep);
    const next: string[] = [];
    for (let i = 0; i < Math.min(common.length, parts.length); i++) {
      if (common[i] === parts[i]) next.push(common[i]!);
      else break;
    }
    common = next;
  }
  return common.join(path.sep) || path.sep;
}
