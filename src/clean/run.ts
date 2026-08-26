import { mkdirSync, readFileSync, renameSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export interface CleanResult {
  executed: boolean;
  planned: string[];
  written: string[];
  backupPaths: string[];
  skipped: string[];
}

export interface CleanOptions {
  output: string;
  yes: boolean;
  /** When true, also remove skills not recorded in ownership (max risk). */
  force?: boolean;
}

/**
 * Execute a cleanup plan. `yes=false` is a dry-run.
 * Ownership-respecting removal: candidates must be recorded in
 * `.nori2reasonix.json` (or `--force` given), and files are moved into a
 * timestamped backup, never deleted outright.
 */
export function executeClean(
  candidates: string[],
  options: CleanOptions
): CleanResult {
  const result: CleanResult = {
    executed: options.yes,
    planned: candidates,
    written: [],
    backupPaths: [],
    skipped: [],
  };

  if (!options.yes) {
    return result;
  }

  const backupRoot = path.join(options.output, ".nori2reasonix", "backup");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(backupRoot, timestamp);

  for (const skill of candidates) {
    const target = skillTargetPath(options.output, skill);

    if (!isOwned(target, options.output) && !options.force) {
      result.skipped.push(
        `${skill}: target is not ours and --force was not given`
      );
      continue;
    }

    if (!existsSync(target)) {
      result.skipped.push(`${skill}: target file does not exist`);
      continue;
    }

    mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `${skill}.SKILL.md`);
    try {
      renameSync(target, backupPath);
      result.backupPaths.push(backupPath);
      result.written.push(target);
    } catch (error) {
      result.skipped.push(
        `${skill}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return result;
}

function skillTargetPath(output: string, skill: string): string {
  if (skill.startsWith("artifact:")) {
    const rel = skill.slice("artifact:".length);
    return path.join(output, rel);
  }
  return path.join(output, ".reasonix", "skills", skill, "SKILL.md");
}

function isOwned(target: string, output: string): boolean {
  const ownershipPath = path.join(output, ".nori2reasonix.json");
  try {
    const raw = JSON.parse(readFileSync(ownershipPath, "utf8")) as {
      files?: Record<string, string>;
    };
    const rel = path.relative(output, target);
    const recordedHash = raw.files?.[rel];
    if (recordedHash === undefined) return false;

    if (!existsSync(target)) return false;
    const currentHash = createHash("sha256")
      .update(readFileSync(target, "utf8"))
      .digest("hex");
    return currentHash === recordedHash;
  } catch {
    return false;
  }
}
