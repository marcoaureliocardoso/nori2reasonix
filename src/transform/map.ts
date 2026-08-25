import type { ParsedNoriInput } from "../manifest/parser.js";
import type {
  NoriMcpServer,
  NoriSlashCommand,
  NoriSubagent,
} from "../manifest/types.js";
import { resolvePlaceholders } from "../template/placeholders.js";
import { FIELD_MAP, TOOL_NAME_MAP, slugify } from "./table.js";

/** A Reasonix-native skill: frontmatter + body (same shape Nori uses). */
export interface ReasonixSkill {
  name: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

/** A Reasonix subagent: a skill with `runAs: subagent` and tool allowlist. */
export interface ReasonixSubagent {
  name: string;
  description?: string;
  runAs: "subagent";
  allowedTools: string[];
  body: string;
}

/** A Reasonix slash command: `<dir>/<file>.md` → `/dir:file`. */
export interface ReasonixCommand {
  name: string;
  frontmatter: Record<string, unknown>;
  body: string;
}

/** Reasonix settings.json hooks block (event → list of hook entries). */
export type ReasonixHooks = Record<string, unknown[]>;

/** A non-fatal translation issue; never silently drop. */
export interface TransformWarning {
  entity: string;
  field: string;
  detail: string;
}

export interface TransformResult {
  /** Skillset/plugin identity (from the Nori manifest). */
  name: string;
  version: string;
  description: string;
  skills: ReasonixSkill[];
  subagents: ReasonixSubagent[];
  commands: ReasonixCommand[];
  mcp: NoriMcpServer[];
  hooks: ReasonixHooks;
  instructions: string | null;
  warnings: TransformWarning[];
}

/**
 * Translate a parsed Nori input into the Reasonix-native model.
 * Pure and deterministic: no file IO, no CLI concerns.
 */
export function transform(input: ParsedNoriInput): TransformResult {
  const warnings: TransformWarning[] = [];

  const skills: ReasonixSkill[] = input.skills.map((skill) => {
    const title = String(skill.frontmatter.name ?? skill.name);
    // The skills/<dir> directory name is Nori's canonical slug; use it when
    // known, otherwise slugify the title.
    const slug = skill.dir !== "" ? skill.dir : slugify(title);
    const fm: Record<string, unknown> = { ...skill.frontmatter, name: slug };
    if (fm.description === undefined) fm.description = title;
    return { name: slug, frontmatter: fm, body: skill.body };
  });

  const subagents: ReasonixSubagent[] = input.subagents.map((agent) => {
    const { allowedTools, toolWarnings } = mapTools(agent);
    for (const warning of toolWarnings) warnings.push(warning);
    const description =
      typeof agent.frontmatter.description === "string"
        ? agent.frontmatter.description
        : typeof agent.json?.description === "string"
          ? agent.json.description
          : agent.name;
    return {
      name: agent.name,
      description,
      runAs: "subagent",
      allowedTools,
      body: agent.body,
    };
  });

  const commands: ReasonixCommand[] = input.slashCommands.map((cmd) =>
    mapCommand(cmd, warnings)
  );

  const hooks: ReasonixHooks = mapHooks();

  return {
    name: input.name,
    version: input.version ?? "0.0.0",
    description:
      typeof input.rawManifest?.description === "string"
        ? input.rawManifest.description
        : "",
    skills,
    subagents,
    commands,
    mcp: input.mcp,
    hooks,
    instructions: input.instructions,
    warnings,
  };
}

function mapTools(agent: NoriSubagent): {
  allowedTools: string[];
  toolWarnings: TransformWarning[];
} {
  const warnings: TransformWarning[] = [];
  const raw = agent.frontmatter.tools;
  const names: string[] = Array.isArray(raw)
    ? raw.map(String)
    : typeof raw === "string"
      ? raw.split(",").map((s) => s.trim())
      : [];

  const allowedTools: string[] = [];
  for (const name of names) {
    const mapped = TOOL_NAME_MAP[name];
    if (mapped === undefined) {
      warnings.push({
        entity: agent.name,
        field: "tools",
        detail: `unmapped tool "${name}" — dropped from allowed-tools (not from source)`,
      });
      continue;
    }
    allowedTools.push(mapped);
  }
  return { allowedTools, toolWarnings: warnings };
}

function mapCommand(
  cmd: NoriSlashCommand,
  warnings: TransformWarning[]
): ReasonixCommand {
  const resolved = resolvePlaceholders(cmd.body, {});
  for (const warning of resolved.warnings) {
    warnings.push({
      entity: cmd.name,
      field: "placeholders",
      detail: warning.detail,
    });
  }
  return {
    name: cmd.name,
    frontmatter: { ...cmd.frontmatter },
    body: resolved.content,
  };
}

function mapHooks(): ReasonixHooks {
  // Hooks arriving in Nori skillsets are rare; this module maps none until a
  // fixture with hooks exists. The FIELD_MAP hook row documents the intended
  // matcher→match translation for the emit module.
  return {};
}

// Keep FIELD_MAP referenced so table.ts is not dead code and the central
// mapping table stays the single source for hook field translation.
void FIELD_MAP;
