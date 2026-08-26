import path from "node:path";
import { readFileSync } from "node:fs";
import type { TransformResult } from "../transform/map.js";
import type { ReasonixSubagent } from "../transform/map.js";
import type { SkillAsset } from "../manifest/types.js";
import { slugify } from "../transform/table.js";

export interface PlannedFile {
  /** Absolute destination path. */
  path: string;
  content: string;
  kind: "skill" | "command" | "settings" | "mcp" | "instructions" | "asset";
}

/** Render a subagent profile's frontmatter + preload-directive body. */
export function renderSubagentFrontmatter(
  agent: ReasonixSubagent
): { frontmatter: Record<string, unknown>; body: string } {
  const frontmatter: Record<string, unknown> = {
    name: agent.name,
    description: agent.description ?? agent.name,
    runAs: "subagent",
    "allowed-tools": agent.allowedTools,
    "max-iters": agent.maxIters,
  };
  const preload =
    agent.skillRefs.length === 0
      ? ""
      : "\n\n## Preloaded skills\n\nLoad each before acting (Reasonix has no frontmatter preload):\n\n" +
        agent.skillRefs
          .map(
            (s) =>
              `- Use run_skill with name "${s}" (arguments: the current task).`
          )
          .join("\n") +
        "\n";
  return { frontmatter, body: agent.body + preload };
}

/**
 * Pure planner: decide what to write, never touching the filesystem.
 */
export function planWorkspace(
  output: string,
  result: TransformResult,
  assets: SkillAsset[] = []
): PlannedFile[] {
  const plan: PlannedFile[] = [];

  for (const skill of result.skills) {
    const frontmatter = renderFrontmatter(skill.frontmatter);
    plan.push({
      path: path.join(
        output,
        ".reasonix",
        "skills",
        safeName(skill.name),
        "SKILL.md"
      ),
      content: frontmatter === "" ? skill.body : `${frontmatter}\n${skill.body}`,
      kind: "skill",
    });
  }

  for (const agent of result.subagents) {
    const { frontmatter, body } = renderSubagentFrontmatter(agent);
    plan.push({
      path: path.join(
        output,
        ".reasonix",
        "skills",
        safeName(agent.name),
        "SKILL.md"
      ),
      content: `${renderFrontmatter(frontmatter)}\n${body}`,
      kind: "skill",
    });
  }

  for (const command of result.commands) {
    const frontmatter = renderFrontmatter(command.frontmatter);
    plan.push({
      path: path.join(
        output,
        ".reasonix",
        "commands",
        `${safeName(command.name)}.md`
      ),
      content: frontmatter === "" ? command.body : `${frontmatter}\n${command.body}`,
      kind: "command",
    });
  }

  if (result.mcp.length > 0) {
    // Each Nori mcp/<name>.json is already { "mcpServers": {...} }.
    // Merge their mcpServers objects into one .mcp.json.
    const merged: Record<string, unknown> = { mcpServers: {} };
    const servers = merged.mcpServers as Record<string, unknown>;
    for (const server of result.mcp) {
      const cfg = server.config as Record<string, unknown>;
      const inner = cfg.mcpServers;
      if (inner !== null && typeof inner === "object") {
        Object.assign(servers, inner as Record<string, unknown>);
      }
    }
    plan.push({
      path: path.join(output, ".mcp.json"),
      content: JSON.stringify(merged, null, 2) + "\n",
      kind: "mcp",
    });
  }

  if (Object.keys(result.hooks).length > 0) {
    plan.push({
      path: path.join(output, ".reasonix", "settings.json"),
      content: JSON.stringify({ hooks: result.hooks }, null, 2) + "\n",
      kind: "settings",
    });
  }

  if (result.instructions !== null) {
    plan.push({
      path: path.join(output, "REASONIX.md"),
      content: result.instructions,
      kind: "instructions",
    });
  }

  // Colocated sidecar assets: read at plan time (all skillset scripts are
  // text) and copy next to the emitted skill directory.
  for (const asset of assets) {
    if (asset.skillName === "") continue; // skillset-root assets handled later
    try {
      const content = readFileSync(asset.filePath, "utf8");
      plan.push({
        path: path.join(
          output,
          ".reasonix",
          "skills",
          safeName(asset.skillName),
          asset.relPath
        ),
        content,
        kind: "asset",
      });
    } catch {
      // Unreadable asset — skip silently at emit; caller inventory reports it.
    }
  }

  return plan;
}

function renderFrontmatter(fm: Record<string, unknown>): string {
  const entries = Object.entries(fm);
  if (entries.length === 0) return "";
  const lines = entries.map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}: ${value.join(", ")}`;
    }
    return `${key}: ${String(value)}`;
  });
  return `---\n${lines.join("\n")}\n---`;
}

/** Reasonix names allow letters, digits, `-`, `_`, `.`. Unified on `slugify`
 * (strips leading dots; falls back to `skill` for empty/`.`/`..`). */
function safeName(name: string): string {
  return slugify(name);
}
