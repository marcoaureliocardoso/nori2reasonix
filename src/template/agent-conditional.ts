export interface AgentContentResult {
  content: string;
  dropped: string[];
  warnings: Array<{ entity: string; detail: string }>;
}

/**
 * Select agent-targeted content for `reasonix`.
 *
 * Nori's agent-specific extras live in a skill's `agents/<name>.yaml`
 * (directory-level), not as inline conditional blocks in SKILL.md. There is
 * no documented inline conditional syntax, so this is intentionally a
 * pass-through: it never mutates content without a canonical marker.
 *
 * When agent directories exist for other targets, callers report them as
 * warnings (never silently dropped) via the `agentsDir` signal.
 */
export function selectAgentContent(
  body: string,
  agent: "reasonix",
  agentsDir?: string[]
): AgentContentResult {
  // No inline conditional syntax exists in the Nori source, so content is
  // unchanged. The agent-conditional surface is directory-level and handled
  // by the discovery layer's warning (see manifest).
  void agent;
  const warnings: Array<{ entity: string; detail: string }> = [];
  if (agentsDir !== undefined && agentsDir.length > 0) {
    warnings.push({
      entity: "skill",
      detail: `agent-specific extras for other targets (${agentsDir.join(
        ", "
      )}) are not mapped to reasonix`,
    });
  }
  return { content: body, dropped: [], warnings };
}
