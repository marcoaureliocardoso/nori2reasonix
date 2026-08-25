import path from "node:path";
import { discoverSkillset, nodeFs } from "./discovery.js";
import { NoriError } from "./errors.js";
import { parseMarkdown } from "./markdown.js";
import type {
  DiscoveryResult,
  Frontmatter,
  JsonObject,
  NoriManifest,
  NoriMcpServer,
  NormalizedSubagentHooks,
} from "./types.js";

/** The known nori.json `type` values for single (non-skillset) packages. */
const SINGLE_KINDS: Record<string, ParsedKind> = {
  skill: "skill",
  subagent: "subagent",
};

export type ParsedKind = "skillset" | "skill" | "subagent";

/**
 * The result of parsing one Nori input directory (skillset, single skill
 * package, or single subagent package).
 */
export interface ParsedNoriInput {
  kind: ParsedKind;
  name: string;
  /** Manifest version, or null for packages without a nori.json. */
  version: string | null;
  /** The raw nori.json manifest, unknown/extra fields preserved. */
  rawManifest: NoriManifest | null;
  /** Manifest fields with no explicit model — preserved verbatim. */
  unknownFields: JsonObject;
  /** `dependencies.skills` normalized to `Record<name, version>`. */
  dependencySkills: Record<string, string>;
  /** Content of AGENTS.md / CLAUDE.md at the skillset root, if present. */
  instructions: string | null;
  skills: DiscoveryResult["skills"];
  subagents: DiscoveryResult["subagents"];
  slashCommands: DiscoveryResult["slashCommands"];
  mcp: NoriMcpServer[];
}

/**
 * Parse a Nori input directory into a model preserving the raw source.
 * Detects skillset vs. single skill/subagent package.
 */
export function parseNoriInput(root: string): ParsedNoriInput {
  const manifestPath = path.join(root, "nori.json");
  const manifestRaw = safeReadFile(manifestPath, nodeFs);

  if (manifestRaw === null) return parseSubagentPackage(root);

  let rawManifest: NoriManifest;
  try {
    rawManifest = JSON.parse(manifestRaw) as NoriManifest;
  } catch {
    throw new NoriError(
      "nor2r/invalid-nori-json",
      `Invalid nori.json at ${manifestPath}`
    );
  }

  const kind = SINGLE_KINDS[rawManifest.type ?? ""] ?? "skillset";

  if (kind === "skill") return parseSingleSkill(root, rawManifest);
  if (kind === "subagent") return parseSubagentPackage(root, rawManifest);
  return parseSkillset(root, rawManifest);
}

function parseSkillset(
  root: string,
  rawManifest: NoriManifest
): ParsedNoriInput {
  const discovery = discoverSkillset(root, nodeFs);
  return assemble(rawManifest, "skillset", discovery, root);
}

function parseSingleSkill(
  root: string,
  rawManifest: NoriManifest
): ParsedNoriInput {
  const skillPath = path.join(root, "SKILL.md");
  const discovery: DiscoveryResult = {
    skills: [],
    subagents: [],
    slashCommands: [],
    mcp: [],
  };

  const raw = safeReadFile(skillPath, nodeFs);
  if (raw !== null) {
    const doc = parseMarkdown(raw);
    discovery.skills.push({
      name: String(doc.frontmatter.name ?? rawManifest.name),
      frontmatter: doc.frontmatter,
      body: doc.body,
      path: skillPath,
      dir: "",
      manifest: rawManifest,
    });
  }

  return assemble(rawManifest, "skill", discovery, root);
}

function parseSubagentPackage(
  root: string,
  manifest?: NoriManifest
): ParsedNoriInput {
  // A subagent package is a directory holding a single `.md` file.
  let entries: string[];
  try {
    entries = nodeFs.readdir(root);
  } catch {
    throw new NoriError(
      "nor2r/no-nori-input",
      `No nori.json or .md skill/subagent file found in ${root}`
    );
  }

  const md = entries.find((e) => e.endsWith(".md"));
  if (md === undefined) {
    throw new NoriError(
      "nor2r/no-nori-input",
      `No nori.json or .md skill/subagent file found in ${root}`
    );
  }

  const filePath = path.join(root, md);
  const doc = parseMarkdown(nodeFs.readFile(filePath));

  return assemble(manifest ?? null, "subagent", {
    skills: [],
    subagents: [
      {
        name: String(doc.frontmatter.name ?? md.replace(/\.md$/, "")),
        frontmatter: doc.frontmatter,
        body: doc.body,
        path: filePath,
        dir: "",
        json: manifest ?? null,
        skills: readFrontmatterList(doc.frontmatter, "skills"),
        hooks: readHooksBlock(doc.frontmatter),
      },
    ],
    slashCommands: [],
    mcp: [],
  }, root);
}

function assemble(
  rawManifest: NoriManifest | null,
  kind: ParsedKind,
  discovery: DiscoveryResult,
  root: string
): ParsedNoriInput {
  const KNOWN_KEYS = new Set([
    "name",
    "version",
    "description",
    "type",
    "dependencies",
    "subagents",
    "slashcommands",
  ]);

  const unknownFields: JsonObject = {};
  if (rawManifest !== null) {
    for (const [key, value] of Object.entries(rawManifest)) {
      if (!KNOWN_KEYS.has(key)) unknownFields[key] = value;
    }
  }

  const depSkills = rawManifest?.dependencies?.skills ?? {};
  const dependencySkills: Record<string, string> = {};
  for (const [name, version] of Object.entries(depSkills)) {
    dependencySkills[name] =
      typeof version === "string" ? version : String(version);
  }

  return {
    kind,
    name: rawManifest?.name ?? discovery.subagents[0]?.name ?? "unknown",
    version: rawManifest?.version ?? null,
    rawManifest,
    unknownFields,
    dependencySkills,
    instructions: readInstructions(root),
    skills: discovery.skills,
    subagents: discovery.subagents,
    slashCommands: discovery.slashCommands,
    mcp: discovery.mcp,
  };
}

function readInstructions(root: string): string | null {
  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    const content = safeReadFile(path.join(root, name), nodeFs);
    if (content !== null) return content;
  }
  return null;
}

/** Read a frontmatter list field (array, comma string, or indented `- item`). */
function readFrontmatterList(fm: Frontmatter, key: string): string[] {
  const raw: unknown = fm[key];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    return raw
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.startsWith("- "))
      .map((s) => s.slice(2).trim());
  }
  return [];
}

/**
 * The `hooks:` block arrives either as a parsed object (flat parser handles
 * only one nesting level via the raw-joined string) or as a raw string. We
 * keep the raw string form verbatim here; transform maps it later.
 */
function readHooksBlock(fm: Frontmatter): NormalizedSubagentHooks {
  const raw: unknown = fm["hooks"];
  if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as NormalizedSubagentHooks;
  }
  return {};
}

function safeReadFile(
  file: string,
  fs: { readFile(file: string): string }
): string | null {
  try {
    return fs.readFile(file);
  } catch {
    return null;
  }
}
