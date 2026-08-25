import path from "node:path";
import type { TransformResult } from "../transform/map.js";
import { renderSubagentFrontmatter } from "../emit-workspace/plan.js";

export interface PlannedFile {
  path: string;
  content: string;
  kind: "manifest" | "claude-manifest" | "skill" | "command" | "mcp";
}

/**
 * Pure planner for the plugin target: a Reasonix plugin package.
 *
 * Native v2 manifest (`reasonix-plugin.json`) declares explicit resources;
 * Claude compatibility manifest (`.claude-plugin/plugin.json`) is metadata.
 */
export function planPlugin(
  output: string,
  result: TransformResult
): PlannedFile[] {
  const plan: PlannedFile[] = [];

  // Native v2 manifest.
  // Nori subagents map to Reasonix runAs:subagent skills (Reasonix-native
  // subagent profiles), so only skills/commands are declared here.
  const contributes: Record<string, unknown> = { skills: ["skills"] };
  if (result.commands.length > 0) contributes.commands = ["commands"];

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
  return name.replace(/[^A-Za-z0-9._-]/g, "-");
}
