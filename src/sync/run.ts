import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SyncAction } from "./plan.js";

export interface SyncResult {
  executed: boolean;
  planned: SyncAction[];
  written: string[];
  backupPaths: string[];
  skipped: string[];
}

export interface SyncOptions {
  output: string;
  yes: boolean;
  /** Directory holding source skills (for emit/re-emit), optional. */
  sourceSkillDir?: string;
  /** When true, also overwrite non-owned drifted files (max risk). */
  force?: boolean;
}

/**
 * Execute a sync plan. `yes=false` is a dry-run: nothing is written.
 * `yes=true` performs the actions, backing up removals and re-emits.
 */
export function executeSync(
  actions: SyncAction[],
  options: SyncOptions
): SyncResult {
  const result: SyncResult = {
    executed: options.yes,
    planned: actions,
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

  for (const item of actions) {
    const target = skillTargetPath(options.output, item.skill);

    switch (item.action) {
      case "emit":
      case "re-emit": {
        const source = options.sourceSkillDir
          ? path.join(options.sourceSkillDir, item.skill, "SKILL.md")
          : null;
        if (source === null) {
          result.skipped.push(`${item.skill}: no source content for ${item.action}`);
          break;
        }
        let content: string;
        try {
          content = readFileSync(source, "utf8");
        } catch {
          result.skipped.push(`${item.skill}: source unreadable`);
          break;
        }
        if (item.action === "re-emit") {
          backupFile(target, backupDir, result);
        }
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, content);
        result.written.push(target);
        break;
      }
      case "remove": {
        try {
          // Move the file into the backup: original is removed AND content
          // is preserved (rename, not copy+delete).
          mkdirSync(backupDir, { recursive: true });
          const backupPath = path.join(backupDir, `${item.skill}.SKILL.md`);
          try {
            renameSync(target, backupPath);
            result.backupPaths.push(backupPath);
            result.written.push(target);
          } catch {
            // Target missing — nothing to remove; still report as handled.
            result.written.push(target);
          }
        } catch (error) {
          result.skipped.push(
            `${item.skill}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        break;
      }
    }
  }

  return result;
}

function skillTargetPath(output: string, skill: string): string {
  return path.join(output, ".reasonix", "skills", skill, "SKILL.md");
}

function backupFile(
  target: string,
  backupDir: string,
  result: SyncResult
): void {
  try {
    const content = readFileSync(target);
    const rel = path.basename(path.dirname(target)); // skill name
    mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `${rel}.SKILL.md`);
    writeFileSync(backupPath, content);
    result.backupPaths.push(backupPath);
    // The actual removal is the caller's removal (rename/rm).
  } catch {
    // File doesn't exist — nothing to back up.
  }
}
