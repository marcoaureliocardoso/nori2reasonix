import { parseNoriInput } from "../manifest/parser.js";
import { transform, type TransformWarning } from "../transform/map.js";
import { planWorkspace } from "../emit-workspace/plan.js";
import { writeWorkspace } from "../emit-workspace/writer.js";
import { planPlugin } from "../emit-plugin/plan.js";
import { writePlugin } from "../emit-plugin/writer.js";
import { listSkillAssets } from "../assets.js";
import { nodeFs } from "../manifest/discovery.js";
import { NoriError } from "../manifest/errors.js";
import type { CliOptions, Target } from "./args.js";

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

  const written: string[] = [];
  const skipped: string[] = [];

  if (options.target === "workspace" || options.target === "both") {
    const wsPlan = planWorkspace(options.output, result, assets);
    const wsWrite = writeWorkspace(wsPlan);
    written.push(...wsWrite.written);
    skipped.push(...wsWrite.skipped);
  }

  if (options.target === "plugin" || options.target === "both") {
    const pluginPlan = planPlugin(options.output, result);
    const pluginWrite = writePlugin(pluginPlan);
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

export type { Target };
