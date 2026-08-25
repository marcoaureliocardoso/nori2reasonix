/**
 * The single Nori → Reasonix mapping table.
 *
 * Project convention: every field/tool-name translation lives here. Do not
 * scatter ad-hoc mappings across the codebase.
 *
 * Reasonix tool names come from the official `docs/TOOL_CONTRACT.md` (built-in
 * tools) and the `reasonix-guide` builtin skill; see AGENTS.md "Canonical
 * sources".
 */

/** Nori subagent tool name → Reasonix built-in tool name. */
export const TOOL_NAME_MAP: Readonly<Record<string, string>> = {
  // Reasonix canonical built-in names.
  Bash: "bash",
  Read: "read_file",
  Write: "write_file",
  Edit: "edit_file",
  Grep: "grep",
  Glob: "glob",
  LS: "ls",
  TodoWrite: "todo_write",
  WebFetch: "web_fetch",
  WebSearch: "web_search",
  // Aliases commonly found in the wild.
  ListFiles: "ls",
  FindFiles: "glob",
};

/** Nori subagent frontmatter tools that map to nothing in Reasonix. */
export const UNMAPPED_TOOLS: Readonly<Record<string, string>> = {
  // No Reasonix equivalent; translating these emits a warning, never a drop.
  Task: "Task",
  Skill: "Skill",
};

/**
 * Normalize a Nori skill/command name to a Reasonix `[A-Za-z0-9._-]{1,64}`
 * slug. Spaces/others become `-`; the human title should already have been
 * moved to `description` by the caller.
 */
export function slugify(name: string): string {
  const slug = name
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "skill";
}

/**
 * Structural mappings from the parsed Nori model to the Reasonix model.
 * `kind` selects which transform applies.
 */
export interface MappingRule {
  kind: "skill" | "subagent" | "command" | "mcp" | "hooks" | "instructions";
  /** map: field-level translation applied by transform(). */
  fields: ReadonlyArray<{ from: string; to: string }>;
}

export const FIELD_MAP: ReadonlyArray<MappingRule> = [
  // Plain skills: copy frontmatter + body; no runAs (inline is Reasonix default).
  { kind: "skill", fields: [] },
  // Subagents become runAs:subagent skills with allowed-tools.
  { kind: "subagent", fields: [] },
  // Slash commands: name is <dir>/<file>.md → /dir:file.
  { kind: "command", fields: [] },
  // MCP: pass-through (config is host-agnostic); only env placeholders matter.
  { kind: "mcp", fields: [] },
  // Hooks: matcher→match (anchored), timeout in ms.
  { kind: "hooks", fields: [{ from: "matcher", to: "match" }] },
  // Instructions: content passthrough as REASONIX.md.
  { kind: "instructions", fields: [] },
];
