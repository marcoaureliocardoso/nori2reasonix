/**
 * Nori source model (manifest module).
 *
 * Every parsed entity carries both the fields we map explicitly and the
 * raw source it came from, so downstream modules can translate without
 * silently dropping anything Nori emits.
 */

/** Arbitrary JSON stored on a nori.json manifest. */
export type JsonObject = Record<string, unknown>;

/** Raw parsed frontmatter fields (YAML scalars, lists, or preserved text). */
export type Frontmatter = Record<string, unknown>;

/** A parsed markdown+frontmatter document. */
export interface MarkdownDocument {
  frontmatter: Frontmatter;
  /** Markdown body with the frontmatter block removed. */
  body: string;
}

/** The raw content of a `nori.json` skillset manifest, unknown fields included. */
export interface NoriManifest {
  name: string;
  version?: string;
  description?: string;
  /** "skillset" for directories; "skill" (and other values) for single packages. */
  type?: string;
  dependencies?: {
    skills?: Record<string, string>;
    [key: string]: unknown;
  };
  subagents?: Array<{
    id?: string;
    name?: string;
    description?: string;
    [key: string]: unknown;
  }>;
  slashcommands?: Array<{
    command?: string;
    description?: string;
    [key: string]: unknown;
  }>;
  /** Fields we do not model explicitly — preserved verbatim. */
  [key: string]: unknown;
}

/** A discovered skill (a `skills/<name>/SKILL.md` or a single-skill package). */
export interface NoriSkill {
  /** Skill name from frontmatter, falling back to the directory/file name. */
  name: string;
  frontmatter: Frontmatter;
  body: string;
  /** Absolute path of the source file. */
  path: string;
  /** The skill's own nori.json, when present. */
  manifest: NoriManifest | null;
}

/** A discovered subagent (a `subagents/<id>.md`, or a single-subagent package). */
export interface NoriSubagent {
  name: string;
  frontmatter: Frontmatter;
  body: string;
  path: string;
}

/** A discovered slash command (`slashcommands/<command>.md`). */
export interface NoriSlashCommand {
  name: string;
  frontmatter: Frontmatter;
  body: string;
  path: string;
}

/** A canonical MCP server config (`mcp/<name>.json`). */
export interface NoriMcpServer {
  /** Server name derived from the config file name. */
  name: string;
  config: JsonObject;
}

/** Best-effort discovery of the content of a skillset directory. */
export interface DiscoveryResult {
  skills: NoriSkill[];
  subagents: NoriSubagent[];
  slashCommands: NoriSlashCommand[];
  mcp: NoriMcpServer[];
}
