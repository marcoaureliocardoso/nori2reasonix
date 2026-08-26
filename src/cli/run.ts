import { parseNoriInput } from "../manifest/parser.js";
import { transform, type TransformWarning, type TransformResult } from "../transform/map.js";
import { planWorkspace } from "../emit-workspace/plan.js";
import { writeWorkspace } from "../emit-workspace/writer.js";
import { planPlugin } from "../emit-plugin/plan.js";
import { writePlugin } from "../emit-plugin/writer.js";
import { listSkillAssets } from "../assets.js";
import { nodeFs } from "../manifest/discovery.js";
import { resolveDependencies, dependencyStubContent } from "../dependencies.js";
import { slugify } from "../transform/table.js";
import { NoriError } from "../manifest/errors.js";
import type { CliOptions, Target } from "./args.js";
import type { ResolutionSummary } from "../manifest/types.js";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Default CLI executor for `nori-skillsets install-location` probing. */
export const defaultExec = (
  command: string,
  args: string[]
): string => execFileSync(command, args, { encoding: "utf8" }).trim();

export interface CliSummary {
  written: string[];
  skipped: string[];
  warnings: TransformWarning[];
  /** Human-readable conversion inventory (rendered by runCli). */
  inventory: string;
}

export interface CliResult {
  exitCode: number;
  summary: CliSummary;
  /** Present when exitCode is non-zero. */
  error?: string;
}

/**
 * Orchestrate a full conversion run. Pure except for the final file writes
 * performed by the emit writers (which use the real filesystem).
 *
 * Exit codes: 0 = success, 3 = input error (NoriError), 1 = I/O failure.
 */
export function runCli(options: CliOptions): CliResult {
  if (options.help) {
    return {
      exitCode: 0,
      summary: { written: [], skipped: [], warnings: [], inventory: "" },
    };
  }

  let parsed;
  try {
    parsed = parseNoriInput(options.input);
  } catch (error) {
    return inputError(error);
  }

  const assets = listSkillAssets(options.input, nodeFs, parsed.skills);
  const resolution = resolveDependencies(parsed, defaultExec, nodeFs);

  const written: string[] = [];
  const skipped: string[] = [];
  const warningSet = new Map<string, TransformWarning>();
  const addWarning = (warning: TransformWarning): void => {
    // Deduplicate by entity+field+detail so `--target both` does not report
    // each transform warning twice (workspace + plugin transforms).
    const key = `${warning.entity}\u0000${warning.field}\u0000${warning.detail}`;
    if (!warningSet.has(key)) warningSet.set(key, warning);
  };

  // Dependency-silent-drop guard: resolution warnings (store unreachable /
  // missing dependency) must surface, never be dropped.
  for (const warning of resolution.warnings) {
    addWarning({
      entity: warning.entity,
      field: warning.field,
      detail: warning.detail,
    });
  }

  // Keep the workspace result (when produced) for the inventory — its counts
  // are target-independent, so no third transform is needed.
  let inventoryResult: TransformResult | null = null;

  if (options.target === "workspace" || options.target === "both") {
    // Reasonix workspace skills live under `<root>/.reasonix/skills`.
    const result = transform(parsed, { skillsRoot: ".reasonix/skills" });
    for (const warning of result.warnings) addWarning(warning);
    inventoryResult = result;

    const wsPlan = planWorkspace(options.output, result, assets);
    // Append vendorized dependency copies AND stubs (the workspace target must
    // not leave `skillRefs` dangling any more than the plugin target does).
    const vendorPlan = planVendoredSkills(options.output, resolution, ".reasonix");
    const stubPlan = planDependencyStubs(options.output, resolution, ".reasonix");
    const wsWrite = writeWorkspace([...wsPlan, ...vendorPlan, ...stubPlan]);
    written.push(...wsWrite.written);
    skipped.push(...wsWrite.skipped);
  }

  if (options.target === "plugin" || options.target === "both") {
    // Reasonix plugin skills live under `<plugin-root>/skills`.
    const result = transform(parsed, { skillsRoot: "skills" });
    for (const warning of result.warnings) addWarning(warning);
    // For plugin-only runs the plugin result is the inventory source.
    if (inventoryResult === null) inventoryResult = result;

    const pluginPlan = planPlugin(options.output, result, resolution, assets);
    const vendorPlan = planVendoredSkills(options.output, resolution, ".");
    const pluginWrite = writePlugin([...pluginPlan, ...vendorPlan]);
    written.push(...pluginWrite.written);
    skipped.push(...pluginWrite.skipped);
  }

  return {
    exitCode: 0,
    summary: {
      written,
      skipped,
      warnings: [...warningSet.values()],
      inventory: renderInventory(inventoryResult ?? transform(parsed)),
    },
  };
}

function inputError(error: unknown): CliResult {
  if (error instanceof NoriError) {
    return {
      exitCode: 3,
      summary: { written: [], skipped: [], warnings: [], inventory: "" },
      error: error.message,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    exitCode: 1,
    summary: { written: [], skipped: [], warnings: [], inventory: "" },
    error: message,
  };
}

/** Render a fixed human-readable conversion inventory (no silent drops). */
export function renderInventory(result: TransformResult): string {
  const eventCount = Object.keys(result.hooks).length;
  const renamed = result.skills.filter(
    (s) => s.frontmatter.name !== s.name
  ).length;
  return [
    `skills:     ${result.skills.length}${renamed > 0 ? ` (${renamed} slug-renamed)` : ""}`,
    `subagents:  ${result.subagents.length} (runAs: subagent)`,
    `commands:   ${result.commands.length}`,
    `hooks:      ${eventCount} events (${Object.keys(result.hooks).join(", ") || "none"})`,
    `warnings:   ${result.warnings.length} (see below — none are silent drops)`,
  ].join("\n");
}
/** Build PlannedFile entries that copy vendorized dependency SKILL.md files. */
function planVendoredSkills(
  output: string,
  resolution: ResolutionSummary,
  rootDir: string
): Array<{ path: string; content: string; kind: "skill" }> {
  const plan: Array<{ path: string; content: string; kind: "skill" }> = [];
  for (const name of resolution.vendorized) {
    const src = resolution.vendorPaths[name];
    if (src === undefined) continue;
    let content: string;
    try {
      content = readFileSync(src, "utf8");
    } catch {
      continue;
    }
    // safeName so a hostile dependency name cannot escape the skills dir.
    const safe = safeName(name);
    const skillRoot =
      rootDir === ".reasonix"
        ? path.join(output, ".reasonix", "skills", safe)
        : path.join(output, "skills", safe);
    plan.push({
      path: path.join(skillRoot, "SKILL.md"),
      content,
      kind: "skill",
    });
  }
  return plan;
}

/** Build stub SKILL.md entries for dependencies that could not be vendorized. */
function planDependencyStubs(
  output: string,
  resolution: ResolutionSummary,
  rootDir: string
): Array<{ path: string; content: string; kind: "skill" }> {
  const plan: Array<{ path: string; content: string; kind: "skill" }> = [];
  for (const name of resolution.stubbed) {
    const safe = safeName(name);
    const skillRoot =
      rootDir === ".reasonix"
        ? path.join(output, ".reasonix", "skills", safe)
        : path.join(output, "skills", safe);
    plan.push({
      path: path.join(skillRoot, "SKILL.md"),
      content: dependencyStubContent(name),
      kind: "skill",
    });
  }
  return plan;
}

/** Reasonix names allow letters, digits, `-`, `_`, `.`; unified on `slugify`
 * (which strips leading dots and falls back to `skill` for empty/`.`/`..`). */
function safeName(name: string): string {
  return slugify(name);
}


