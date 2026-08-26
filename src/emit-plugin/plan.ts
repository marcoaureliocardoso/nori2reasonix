import path from "node:path";
import { readFileSync } from "node:fs";
import type { TransformResult } from "../transform/map.js";
import { renderSubagentFrontmatter } from "../emit-workspace/plan.js";
import type { ResolutionSummary, SkillAsset } from "../manifest/types.js";
import { dependencyStubContent } from "../dependencies.js";
import { slugify } from "../transform/table.js";

export interface PlannedFile {
  path: string;
  content: string;
  kind: "manifest" | "claude-manifest" | "skill" | "command" | "mcp" | "asset";
}

/**
 * Pure planner for the plugin target: a Reasonix plugin package.
 *
 * Native v2 manifest (`reasonix-plugin.json`) declares explicit resources;
 * Claude compatibility manifest (`.claude-plugin/plugin.json`) is metadata.
 */
export function planPlugin(
  output: string,
  result: TransformResult,
  resolution: ResolutionSummary,
  assets: SkillAsset[] = []
): PlannedFile[] {
  const plan: PlannedFile[] = [];

  // Native v2 manifest.
  // Nori subagents map to Reasonix runAs:subagent skills (Reasonix-native
  // subagent profiles), so skills/commands are declared as resources and
  // hooks are declared when present.
  const contributes: Record<string, unknown> = { skills: ["skills"] };
  if (result.commands.length > 0) contributes.commands = ["commands"];
  if (Object.keys(result.hooks).length > 0) {
    contributes.hooks = { settings: result.hooks };
  }

  plan.push({
    path: path.join(output, "reasonix-plugin.json"),
    content:
      JSON.stringify(
        {
          apiVersion: "reasonix.io/plugin/v2",
          name: result.name,
          version: result.version,
          description: result.description,
          contributes,
        },
        null,
        2
      ) + "\n",
    kind: "manifest",
  });

  // Claude compatibility manifest (metadata only; skills auto-discovered).
  plan.push({
    path: path.join(output, ".claude-plugin", "plugin.json"),
    content:
      JSON.stringify(
        {
          name: result.name,
          version: result.version,
          description: result.description,
        },
        null,
        2
      ) + "\n",
    kind: "claude-manifest",
  });

  // Skills (plain skills + subagents as runAs:subagent skills).
  for (const skill of result.skills) {
    const frontmatter = renderFrontmatter(skill.frontmatter);
    plan.push({
      path: path.join(
        output,
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
      path: path.join(output, "skills", safeName(agent.name), "SKILL.md"),
      content: `${renderFrontmatter(frontmatter)}\n${body}`,
      kind: "skill",
    });
  }

  // Commands.
  for (const command of result.commands) {
    const frontmatter = renderFrontmatter(command.frontmatter);
    plan.push({
      path: path.join(
        output,
        "commands",
        `${safeName(command.name)}.md`
      ),
      content:
        frontmatter === "" ? command.body : `${frontmatter}\n${command.body}`,
      kind: "command",
    });
  }

  // MCP servers (merge shape identical to workspace emit).
  if (result.mcp.length > 0) {
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

  // Dependency stubs (vendorized copies are handled by runCli in Task 14).
  for (const name of resolution.stubbed) {
    plan.push({
      path: path.join(output, "skills", safeName(name), "SKILL.md"),
      content: dependencyStubContent(name),
      kind: "skill",
    });
  }

  // Colocated sidecar assets under skills/<name>/.
  for (const asset of assets) {
    if (asset.skillName === "") continue;
    try {
      const content = readFileSync(asset.filePath, "utf8");
      plan.push({
        path: path.join(
          output,
          "skills",
          safeName(asset.skillName),
          asset.relPath
        ),
        content,
        kind: "asset",
      });
    } catch {
      // Unreadable asset — skip at emit.
    }
  }

  return plan;
}

function renderFrontmatter(fm: Record<string, unknown>): string {
  const entries = Object.entries(fm);
  if (entries.length === 0) return "";
  const lines = entries.map(([key, value]) => {
    if (Array.isArray(value)) return `${key}: ${value.join(", ")}`;
    return `${key}: ${String(value)}`;
  });
  return `---\n${lines.join("\n")}\n---`;
}

function safeName(name: string): string {
  return slugify(name);
}
