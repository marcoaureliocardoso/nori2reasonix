import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseHooksBlock, parseMarkdown } from "./markdown.js";
import type {
  DiscoveryResult,
  Frontmatter,
  JsonObject,
  NoriManifest,
  NoriMcpServer,
  NoriSkill,
  NoriSlashCommand,
  NoriSubagent,
  NormalizedSubagentHooks,
} from "./types.js";

/** Minimal filesystem seam so the core stays IO-injectable in tests. */
export interface FileSystem {
  readdir(dir: string): string[];
  readFile(file: string): string;
}

export const nodeFs: FileSystem = {
  readdir: (dir) => readdirSync(dir),
  readFile: (file) => readFileSync(file, "utf8"),
};

/**
 * Discover the content of a Nori skillset directory:
 * `skills/`, `subagents/`, `slashcommands/`, and `mcp/`.
 */
export function discoverSkillset(
  root: string,
  fs: FileSystem = nodeFs
): DiscoveryResult {
  return {
    skills: discoverSkills(path.join(root, "skills"), fs),
    subagents: discoverSubagents(path.join(root, "subagents"), fs),
    slashCommands: discoverSlashCommands(path.join(root, "slashcommands"), fs),
    mcp: discoverMcp(path.join(root, "mcp"), fs),
  };
}

function discoverSkills(dir: string, fs: FileSystem): NoriSkill[] {
  const skills: NoriSkill[] = [];
  for (const entry of safeReaddir(dir, fs)) {
    const skillDir = path.join(dir, entry);
    const skillPath = path.join(skillDir, "SKILL.md");
    const skillRaw = safeReadFile(skillPath, fs);
    if (skillRaw === null) continue;

    const manifestRaw = safeReadFile(path.join(skillDir, "nori.json"), fs);
    const doc = parseMarkdown(skillRaw);
    skills.push({
      name: String(doc.frontmatter.name ?? entry),
      frontmatter: doc.frontmatter,
      body: doc.body,
      path: skillPath,
      dir: entry,
      manifest: manifestRaw === null ? null : (parseJson(manifestRaw) as NoriManifest),
    });
  }
  return skills;
}

function discoverSubagents(dir: string, fs: FileSystem): NoriSubagent[] {
  const subagents: NoriSubagent[] = [];
  for (const entry of safeReaddir(dir, fs)) {
    const entryPath = path.join(dir, entry);

    // Case A: flat `<name>.md` (legacy, already supported).
    if (entry.endsWith(".md")) {
      pushSubagentFile(entryPath, entry.replace(/\.md$/, ""), "", fs, subagents);
      continue;
    }

    // Case B: directory `<name>/SUBAGENT.md` + optional `<name>/nori.json`.
    const dirFiles = safeReaddir(entryPath, fs);
    const sub = dirFiles.includes("SUBAGENT.md")
      ? path.join(entryPath, "SUBAGENT.md")
      : dirFiles
          .filter((f) => f.endsWith(".md"))
          .map((f) => path.join(entryPath, f))[0];
    if (sub !== undefined) {
      pushSubagentFile(sub, entry, entry, fs, subagents);
    }
  }
  return subagents;
}

function pushSubagentFile(
  filePath: string,
  fallbackName: string,
  dir: string,
  fs: FileSystem,
  out: NoriSubagent[]
): void {
  const raw = safeReadFile(filePath, fs);
  if (raw === null) return;
  const doc = parseMarkdown(raw);

  // A subagent definition always carries `name:` in its frontmatter.
  // Files without it (e.g. docs.md, Noridoc prose) are documentation.
  if (doc.frontmatter.name === undefined) return;

  const jsonRaw = safeReadFile(
    path.join(path.dirname(filePath), "nori.json"),
    fs
  );
  const skills = readFrontmatterList(doc.frontmatter, "skills");
  let hooks: NormalizedSubagentHooks = {};
  const hooksRaw = doc.frontmatter.hooks;
  if (typeof hooksRaw === "string") {
    hooks = parseHooksBlock(hooksRaw) as unknown as NormalizedSubagentHooks;
  } else if (
    hooksRaw !== null &&
    typeof hooksRaw === "object" &&
    !Array.isArray(hooksRaw)
  ) {
    hooks = hooksRaw as NormalizedSubagentHooks;
  }
  // Any other form (`_raw` strings etc.) stays empty; transform warns.

  out.push({
    name: String(doc.frontmatter.name),
    frontmatter: doc.frontmatter,
    body: doc.body,
    path: filePath,
    dir,
    json: jsonRaw === null ? null : (parseJson(jsonRaw) as NoriManifest),
    skills,
    hooks,
  });
}

/** Read a frontmatter list field that may be an array or a string block. */
function readFrontmatterList(fm: Frontmatter, key: string): string[] {
  const raw: unknown = fm[key];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") {
    // Either a comma list ("Read, Grep") or an indented `- item` block
    // ("  - brainstorming\n  - root-cause-analysis").
    return raw
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.startsWith("- "))
      .map((s) => s.slice(2).trim());
  }
  return [];
}

function discoverSlashCommands(dir: string, fs: FileSystem): NoriSlashCommand[] {
  const commands: NoriSlashCommand[] = [];
  for (const entry of safeReaddir(dir, fs)) {
    if (!entry.endsWith(".md")) continue;
    const filePath = path.join(dir, entry);
    const raw = safeReadFile(filePath, fs);
    if (raw === null) continue;

    const doc = parseMarkdown(raw);
    commands.push({
      name: String(doc.frontmatter.name ?? entry.replace(/\.md$/, "")),
      frontmatter: doc.frontmatter,
      body: doc.body,
      path: filePath,
    });
  }
  return commands;
}

function discoverMcp(
  dir: string,
  fs: FileSystem
): NoriMcpServer[] {
  const servers: NoriMcpServer[] = [];
  for (const entry of safeReaddir(dir, fs)) {
    if (!entry.endsWith(".json")) continue;
    const raw = safeReadFile(path.join(dir, entry), fs);
    if (raw === null) continue;

    servers.push({
      name: entry.replace(/\.json$/, ""),
      config: parseJson(raw),
      env: extractEnvPlaceholders(raw),
    });
  }
  return servers;
}

/** Collect `${NAME}`-style placeholders from an MCP config (verbatim). */
function extractEnvPlaceholders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    out[m[1]!] = m[0];
  }
  return out;
}

function safeReaddir(dir: string, fs: FileSystem): string[] {
  try {
    return fs.readdir(dir);
  } catch {
    return [];
  }
}

function safeReadFile(file: string, fs: FileSystem): string | null {
  try {
    return fs.readFile(file);
  } catch {
    return null;
  }
}

function parseJson(raw: string): JsonObject {
  return JSON.parse(raw) as JsonObject;
}
