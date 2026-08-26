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

export interface TransformOptions {
  /**
   * Where emitted skills live relative to the emit root, used to resolve
   * `{{skills_dir}}` in hook commands. Workspace target uses
   * `.reasonix/skills`; plugin target uses `skills`.
   */
  skillsRoot?: string;
}

/**
 * Translate a parsed Nori input into the Reasonix-native model.
 * Pure and deterministic: no file IO, no CLI concerns.
 */
export function transform(
  input: ParsedNoriInput,
  options: TransformOptions = {}
): TransformResult {
  const warnings: TransformWarning[] = [];
  const skillsRoot = options.skillsRoot ?? "skills";

  const skills: ReasonixSkill[] = input.skills.map((skill) => {
    const title = String(skill.frontmatter.name ?? skill.name);
    // The skills/<dir> directory name is Nori's canonical slug; use it when
    // known, otherwise slugify the title.
    const slug = skill.dir !== "" ? skill.dir : slugify(title);
    const fm: Record<string, unknown> = { ...skill.frontmatter, name: slug };
    if (fm.description === undefined) fm.description = title;
    return {
      name: slug,
      frontmatter: fm,
      body: rewriteSidecarPaths(skill.body),
    };
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

  const hooks: ReasonixHooks = mapHooks(subagents, warnings, skillsRoot);

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
  const stripped = name
    .replace(/^skills\//, "")
    .replace(/\/SKILL\.md$/, "")
    .replace(/\.md$/, "");
  // Slug so it matches the slugified emitted dependency directory/name.
  return slugify(stripped);
}

const SIDECAR_SEGS = ["references", "scripts", "templates", "examples"];

/** Rewrite relative skill-body sidecar refs to the emitted `./dir/file` form. */
export function rewriteSidecarPaths(
  body: string,
  refs: string[] = SIDECAR_SEGS
): string {
  let out = body;
  for (const seg of refs) {
    const pattern = new RegExp(`(?<![\\w/])${seg}/([A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*)`, "g");
    out = out.replace(pattern, `./${seg}/$1`);
  }
  return out;
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
  warnings: TransformWarning[],
  skillsRoot: string
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
            const resolved = resolveHookTemplate(cmdStr, agent.name, skillsRoot);
            const args = Array.isArray(cmd["args"])
              ? cmd["args"].map(String)
              : [];
            // Shell-quote each argument so spaces/metacharacters cannot break
            // or inject; join into a single `sh -c` command string (Reasonix
            // runs hook `command` through the platform shell).
            const quotedArgs = args.map(quoteShellArg).join(" ");
            mapped["command"] =
              quotedArgs !== "" ? `${resolved} ${quotedArgs}` : resolved;
          } else {
            warnings.push({
              entity: agent.name,
              field: "hooks",
              detail: `hook entry under ${eventName} has no command — dropped from settings.json`,
            });
            continue;
          }

          // Nori/Claude hook timeouts are expressed in SECONDS (the reference
          // SUBAGENT.md values 7/5 are seconds); Reasonix `timeout` is ms.
          const rawTimeout = cmd["timeout"];
          const seconds =
            typeof rawTimeout === "number"
              ? rawTimeout
              : typeof rawTimeout === "string" && /^\d+$/.test(String(rawTimeout))
                ? parseInt(String(rawTimeout), 10)
                : undefined;
          mapped["timeout"] =
            seconds !== undefined
              ? seconds * 1000
              : eventName === "PreToolUse" || eventName === "UserPromptSubmit"
                ? 5000
                : 30000;

          events.set(eventName, [...(events.get(eventName) ?? []), mapped]);
        }
      }
    }
  }

  // Warn once per unmapped hook field category so a single hook cannot flood.
  // Scan only the field NAMES, not serialized values, so a command/arg that
  // literally contains a field name cannot false-positive.
  for (const agent of agents) {
    for (const field of HOOK_UNMAPPED_FIELDS) {
      const found = roleHooksHasField(agent.roleHooks, field);
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

/** True when any hook object carries `field` as an object KEY (not a value). */
function roleHooksHasField(roleHooks: Record<string, unknown>, field: string): boolean {
  const stack: unknown[] = [roleHooks];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === null || typeof current !== "object") continue;
    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      if (key === field) return true;
      stack.push(value);
    }
  }
  return false;
}

/** Shell-quote a single hook argument (single quotes, POSIX-safe). */
function quoteShellArg(arg: string): string {
  if (arg === "") return "''";
  if (/^[A-Za-z0-9_./:=+\-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** `{{skills_dir}}` points at the skillset skills/ root; resolve it to where
 * this target actually emits skills. `{{skill_dir}}` is the owning skill dir. */
function resolveHookTemplate(
  command: string,
  skillDir: string,
  skillsRoot: string
): string {
  let out = command;
  out = out.replace(/\{\{\s*skill_dir\s*\}\}/g, skillDir);
  out = out.replace(/\{\{\s*skills_dir\s*\}\}/g, skillsRoot);
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
 * names, so map through TOOL_NAME_MAP and add the PascalCase original as an
 * alternative pattern so both spellings match. */
function anchorToolPattern(pattern: string): string {
  if (pattern === "" || pattern === "*") return "*";
  return pattern
    .split("|")
    .map((p) => {
      const t = p.trim();
      if (t === "*") return ".*";
      const mapped = TOOL_NAME_MAP[t];
      if (mapped === undefined) return t;
      // Match the lowercase Reasonix name AND the Nori PascalCase original.
      return t === mapped ? t : `${mapped}|${t}`;
    })
    .join("|")
    .replace(/\*/g, ".*");
}
