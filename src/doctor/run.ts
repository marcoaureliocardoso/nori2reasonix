import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { resolveNoriSource, type NoriSource } from "./source.js";
import { diffSkillsets, type DiffEntry } from "./diff.js";
import type { SourceSide, TargetSide } from "./diff.js";

export interface DoctorReport {
  source: NoriSource;
  entries: DiffEntry[];
  exitCode: 0 | 1 | 3;
  /** Present when a source could not be resolved/read. */
  error?: string;
}

export type Executor = (command: string, args: string[]) => string;

const defaultExecutor: Executor = (command, args) =>
  execFileSync(command, args, { encoding: "utf8" }).trim();

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Read the active Nori skillset's expected skills (name → content hash). */
function readSourceSide(noriJsonPath: string): SourceSide {
  const skills: Record<string, { hash: string }> = {};

  const manifest = JSON.parse(readFileSync(noriJsonPath, "utf8")) as {
    dependencies?: { skills?: Record<string, string> };
  };
  const deps = manifest.dependencies?.skills ?? {};

  const skillsDir = path.join(path.dirname(noriJsonPath), "skills");
  for (const name of Object.keys(deps)) {
    const skillPath = path.join(skillsDir, name, "SKILL.md");
    if (existsSync(skillPath)) {
      skills[name] = { hash: sha256(readFileSync(skillPath, "utf8")) };
    } else {
      skills[name] = { hash: `missing:${name}` };
    }
  }
  return { skills };
}

/** Read what the target loaded via `reasonix doctor capabilities --json`. */
function readTargetSide(workspace: string, exec: Executor): TargetSide {
  const skills = new Map<string, { path: string; hash: string }>();
  const raw = exec("reasonix", [
    "doctor",
    "capabilities",
    "--json",
  ]);
  const report = JSON.parse(raw) as {
    skills?: {
      entries?: Array<{ name: string; path?: string }>;
    };
  };
  for (const entry of report.skills?.entries ?? []) {
    const file = entry.path ?? "";
    let hash = `unhashable:${entry.name}`;
    try {
      hash = sha256(readFileSync(file, "utf8"));
    } catch {
      // keep the unhashable marker
    }
    skills.set(entry.name, { path: file, hash });
  }
  return { skills };
}

/**
 * Run the integration doctor (read-only).
 *
 * Exit codes: 0 = in sync, 1 = divergence, 3 = source unavailable.
 */
export function runDoctor(options: {
  installLocation?: string;
  active?: string;
  noriJsonPath?: string;
  workspace?: string;
  exec?: Executor;
}): DoctorReport {
  const exec = options.exec ?? defaultExecutor;

  let source: NoriSource;
  try {
    if (options.noriJsonPath !== undefined) {
      source = {
        installLocation: "",
        active: "",
        noriJsonPath: options.noriJsonPath,
        profilesRoot: path.dirname(options.noriJsonPath),
        relative: "",
      };
    } else if (
      options.installLocation !== undefined &&
      options.active !== undefined
    ) {
      source = resolveNoriSource(options.installLocation, options.active);
    } else {
      const installLocation = exec("nori-skillsets", [
        "-n",
        "install-location",
      ]);
      const active = exec("nori-skillsets", ["-n", "current"]);
      source = resolveNoriSource(installLocation, active);
    }
  } catch (error) {
    return {
      source: {
        installLocation: "",
        active: "",
        noriJsonPath: "",
        profilesRoot: "",
        relative: "",
      },
      entries: [],
      exitCode: 3,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  let sourceSide: SourceSide;
  try {
    sourceSide = readSourceSide(source.noriJsonPath);
  } catch (error) {
    return {
      source,
      entries: [],
      exitCode: 3,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  let targetSide: TargetSide;
  try {
    targetSide = readTargetSide(options.workspace ?? ".", exec);
  } catch (error) {
    return {
      source,
      entries: [],
      exitCode: 3,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const entries = diffSkillsets(sourceSide, targetSide);
  const divergent = entries.some((e) => e.status !== "ok");
  return { source, entries, exitCode: divergent ? 1 : 0 };
}
