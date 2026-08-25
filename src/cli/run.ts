import { parseNoriInput } from "../manifest/parser.js";
import { transform, type TransformWarning } from "../transform/map.js";
import { planWorkspace } from "../emit-workspace/plan.js";
import { writeWorkspace } from "../emit-workspace/writer.js";
import { planPlugin } from "../emit-plugin/plan.js";
import { writePlugin } from "../emit-plugin/writer.js";
import { listSkillAssets } from "../assets.js";
import { nodeFs } from "../manifest/discovery.js";
import { resolveDependencies } from "../dependencies.js";
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
      summary: { written: [], skipped: [], warnings: [] },
    };
  }

  let parsed;
  try {
    parsed = parseNoriInput(options.input);
  } catch (error) {
    return inputError(error);
  }

  const result = transform(parsed);
  const assets = listSkillAssets(options.input, nodeFs, parsed.skills);
  const resolution = resolveDependencies(parsed, defaultExec, nodeFs);

  const written: string[] = [];
  const skipped: string[] = [];

  if (options.target === "workspace" || options.target === "both") {
    const wsPlan = planWorkspace(options.output, result, assets);
    // Append vendorized dependency SKILL.md copies to the workspace plan.
    const vendorPlan = planVendoredSkills(options.output, resolution, ".reasonix");
    const wsWrite = writeWorkspace([...wsPlan, ...vendorPlan]);
    written.push(...wsWrite.written);
    skipped.push(...wsWrite.skipped);
  }

  if (options.target === "plugin" || options.target === "both") {
    const pluginPlan = planPlugin(options.output, result, resolution, assets);
    // Plugin target already emits stubs; append vendorized copies too.
    const vendorPlan = planVendoredSkills(options.output, resolution, ".");
    const pluginWrite = writePlugin([...pluginPlan, ...vendorPlan]);
    written.push(...pluginWrite.written);
    skipped.push(...pluginWrite.skipped);
  }

  return {
    exitCode: 0,
    summary: { written, skipped, warnings: result.warnings },
  };
}

function inputError(error: unknown): CliResult {
  if (error instanceof NoriError) {
    return {
      exitCode: 3,
      summary: { written: [], skipped: [], warnings: [] },
      error: error.message,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    exitCode: 1,
    summary: { written: [], skipped: [], warnings: [] },
    error: message,
  };
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
    const skillRoot =
      rootDir === ".reasonix"
        ? path.join(output, ".reasonix", "skills", name)
        : path.join(output, "skills", name);
    plan.push({
      path: path.join(skillRoot, "SKILL.md"),
      content,
      kind: "skill",
    });
  }
  return plan;
}


