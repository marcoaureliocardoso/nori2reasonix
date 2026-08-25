import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseMarkdown } from "./markdown.js";
import type {
  DiscoveryResult,
  JsonObject,
  NoriManifest,
  NoriSkill,
  NoriSlashCommand,
  NoriSubagent,
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
      manifest: manifestRaw === null ? null : (parseJson(manifestRaw) as NoriManifest),
    });
  }
  return skills;
}

function discoverSubagents(dir: string, fs: FileSystem): NoriSubagent[] {
  const subagents: NoriSubagent[] = [];
  for (const entry of safeReaddir(dir, fs)) {
    if (!entry.endsWith(".md")) continue;
    const filePath = path.join(dir, entry);
    const raw = safeReadFile(filePath, fs);
    if (raw === null) continue;

    const doc = parseMarkdown(raw);
    // A subagent definition always carries `name:` in its frontmatter.
    // Files without it (e.g. docs.md, Noridoc prose) are documentation.
    if (doc.frontmatter.name === undefined) continue;

    subagents.push({
      name: String(doc.frontmatter.name),
      frontmatter: doc.frontmatter,
      body: doc.body,
      path: filePath,
    });
  }
  return subagents;
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
): Array<{ name: string; config: JsonObject }> {
  const servers: Array<{ name: string; config: JsonObject }> = [];
  for (const entry of safeReaddir(dir, fs)) {
    if (!entry.endsWith(".json")) continue;
    const raw = safeReadFile(path.join(dir, entry), fs);
    if (raw === null) continue;

    servers.push({
      name: entry.replace(/\.json$/, ""),
      config: parseJson(raw),
    });
  }
  return servers;
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
