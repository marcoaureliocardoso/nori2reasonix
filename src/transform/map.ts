import type { ParsedNoriInput } from "../manifest/parser.js";
import type {
  NoriMcpServer,
  NoriSlashCommand,
  NoriSubagent,
} from "../manifest/types.js";
import { resolvePlaceholders } from "../template/placeholders.js";
import {
  FIELD_MAP,
  HOOK_UNMAPPED_FIELDS,
  TOOL_NAME_MAP,
  slugify,
} from "./table.js";

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
  /** Mapped from Nori `maxTurns`; clamped to [1,32]; 16 when absent. */
  maxIters: number;
  /** `skills:` preload list, normalized (no `skills/` prefix, no `.md`). */
  skillRefs: string[];
  /** The subagent's own hooks block (raw); merged into global hooks later. */
  roleHooks: Record<string, unknown>;
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
    const meta = mapAgentMetadata(agent, warnings);
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
      maxIters: meta.maxIters,
      skillRefs: meta.skillRefs,
      roleHooks: meta.roleHooks,
      body: agent.body,
    };
  });

  const commands: ReasonixCommand[] = input.slashCommands.map((cmd) =>
    mapCommand(cmd, warnings)
  );

  const hooks: ReasonixHooks = mapHooks(subagents, warnings);

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

/**
 * Map subagent metadata the Reasonix model does not express 1:1:
 * `maxTurns` → `maxIters` (clamped), `skills` → `skillRefs` (body preload),
 * `disallowedTools` → warnings (no negative allowlist), `model` → warning
 * unless `inherit` (no portable per-skill override), `hooks` → `roleHooks`.
 */
function mapAgentMetadata(
  agent: NoriSubagent,
  warnings: TransformWarning[]
): {
  maxIters: number;
  skillRefs: string[];
  roleHooks: Record<string, unknown>;
} {
  let maxIters = 16;
  const rawTurns = agent.frontmatter.maxTurns;
  if (typeof rawTurns === "number") {
    maxIters = Math.min(32, Math.max(1, Math.round(rawTurns)));
  } else if (typeof rawTurns === "string" && /^\d+$/.test(rawTurns)) {
    maxIters = Math.min(32, Math.max(1, parseInt(rawTurns, 10)));
  } else if (typeof rawTurns === "string" && /^\d+$/.test(rawTurns) === false) {
    // not numeric: fall through to default, no warning (documented default)
  }

  const disallowed = readList(agent.frontmatter.disallowedTools);
  for (const tool of disallowed) {
    warnings.push({
      entity: agent.name,
      field: "disallowedTools",
      detail: `tool "${tool}" is deny-listed in Nori; Reasonix has no negative allowlist — exclude it from allowed-tools instead (dropped)`,
    });
  }

  const model = agent.frontmatter.model;
  if (typeof model === "string" && model !== "inherit") {
    warnings.push({
      entity: agent.name,
      field: "model",
      detail: `model "${model}" has no portable Reasonix override — child will inherit the executor model`,
    });
  }

  const skillRefs = readList(agent.frontmatter.skills).map(normalizeSkillRef);

  return {
    maxIters,
    skillRefs,
    roleHooks: (agent.hooks ?? {}) as Record<string, unknown>,
  };
}

function normalizeSkillRef(name: string): string {
  return name
    .replace(/^skills\//, "")
    .replace(/\/SKILL\.md$/, "")
    .replace(/\.md$/, "");
}

function readList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    return value
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.startsWith("- "))
      .map((s) => s.slice(2).trim());
  }
  return [];
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

function mapHooks(
  agents: ReasonixSubagent[],
  warnings: TransformWarning[]
): ReasonixHooks {
  const events = new Map<string, unknown[]>();

  for (const agent of agents) {
    for (const [eventNameRaw, hookListRaw] of Object.entries(agent.roleHooks)) {
      const eventName = mapEventName(eventNameRaw);
      // roleHooks entries come from parseHooksBlock: an array of objects like
      // { matcher, hooks: [ {type, command, args, timeout} ] }.
      const entries = Array.isArray(hookListRaw) ? hookListRaw : [hookListRaw];

      for (const rawEntry of entries) {
        if (rawEntry === null || typeof rawEntry !== "object") continue;
        const entry = rawEntry as Record<string, unknown>;

        const matcher = entry["matcher"];
        const commandHooks = entry["hooks"];

        // A matcher entry with a nested hooks array.
        const cmdList: unknown[] = Array.isArray(commandHooks)
          ? commandHooks
          : [];

        if (cmdList.length === 0 && entry["command"] !== undefined) {
          // Inline command form: { command, args, timeout }.
          cmdList.push(entry);
        }

        for (const cmdRaw of cmdList) {
          if (cmdRaw === null || typeof cmdRaw !== "object") continue;
          const cmd = cmdRaw as Record<string, unknown>;

          const mapped: Record<string, unknown> = {};
          if (matcher !== undefined) {
            mapped["match"] = anchorToolPattern(String(matcher));
          }

          const cmdStr = cmd["command"];
          if (typeof cmdStr === "string") {
            const resolved = resolveHookTemplate(cmdStr, agent.name);
            const args = Array.isArray(cmd["args"])
              ? cmd["args"].map(String)
              : [];
            mapped["command"] =
              args.length > 0 ? `${resolved} ${args.join(" ")}` : resolved;
          } else {
            warnings.push({
              entity: agent.name,
              field: "hooks",
              detail: `hook entry under ${eventName} has no command — dropped from settings.json`,
            });
            continue;
          }

          mapped["timeout"] =
            typeof cmd["timeout"] === "number"
              ? cmd["timeout"]
              : typeof cmd["timeout"] === "string" &&
                  /^\d+$/.test(String(cmd["timeout"]))
                ? parseInt(String(cmd["timeout"]), 10)
                : eventName === "PreToolUse" || eventName === "UserPromptSubmit"
                  ? 5000
                  : 30000;

          events.set(eventName, [...(events.get(eventName) ?? []), mapped]);
        }
      }
    }
  }

  // Warn once per unmapped hook field category so a single hook cannot flood.
  for (const agent of agents) {
    for (const field of HOOK_UNMAPPED_FIELDS) {
      const found =
        typeof agent.roleHooks === "object" && agent.roleHooks !== null
          ? JSON.stringify(agent.roleHooks).includes(`"${field}"`)
          : false;
      if (found) {
        warnings.push({
          entity: agent.name,
          field: "hooks",
          detail: `hook field "${field}" has no Reasonix equivalent (dropped from settings.json)`,
        });
      }
    }
  }

  const out: ReasonixHooks = {};
  for (const [k, v] of events) out[k] = v;
  void FIELD_MAP; // keep the central mapping table referenced
  return out;
}

/** `{{skills_dir}}` points at the skillset skills/ root; after conversion the
 * command is written relative to the emit root, so collapse it to `.`. */
function resolveHookTemplate(command: string, skillDir: string): string {
  let out = command;
  out = out.replace(/\{\{\s*skill_dir\s*\}\}/g, skillDir);
  out = out.replace(/\{\{\s*skills_dir\s*\}\}/g, ".");
  return out;
}

/** Reasonix knows 11 events; normalize Nori/Claude spellings to PascalCase. */
function mapEventName(name: string): string {
  const known = new Set([
    "PreToolUse",
    "PostToolUse",
    "PreCompact",
    "PostCompact",
    "PermissionRequest",
    "UserPromptSubmit",
    "Stop",
    "PostLLMCall",
    "SessionStart",
    "SessionEnd",
    "SubagentStop",
    "Notification",
  ]);
  if (known.has(name)) return name;
  const pascal = name.replace(
    /[-_ ]+(.)/g,
    (_, c: string) => c.toUpperCase()
  );
  // Ensure the first letter is uppercase (handle e.g. "pre-tool-use").
  const title = pascal.charAt(0).toUpperCase() + pascal.slice(1);
  return known.has(title) ? title : name;
}

/** Reasonix `match` is an anchored regex; Nori matchers like "Bash" are tool
 * names, so mirror the lowercase builtin form too. */
function anchorToolPattern(pattern: string): string {
  if (pattern === "" || pattern === "*") return "*";
  return pattern
    .split("|")
    .map((p) => {
      const t = p.trim();
      return t === "Bash" ? "bash|Bash" : t;
    })
    .join("|")
    .replace(/\*/g, ".*");
}
