import path from "node:path";
import type { FileSystem } from "./manifest/discovery.js";
import type { NoriSkill, SkillAsset } from "./manifest/types.js";

const SIDECAR_DIRS = ["references", "scripts", "templates", "examples"];

/** Recursively collect files under `dir` as `{ filePath, relPath }` pairs. */
function walk(
  dir: string,
  fs: FileSystem,
  base: string,
  out: Array<{ filePath: string; relPath: string }>
): void {
  let entries: string[];
  try {
    entries = fs.readdir(dir).sort();
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const rel = path.relative(base, full).split(path.sep).join("/");
    let isDir = false;
    try {
      fs.readdir(full);
      isDir = true;
    } catch {
      isDir = false;
    }
    if (isDir) walk(full, fs, base, out);
    else out.push({ filePath: full, relPath: rel });
  }
}

/**
 * List colocated sidecar assets for every skill: the `references/`,
 * `scripts/`, `templates/`, and `examples/` subtrees plus any loose files at
 * the skill root. `SKILL.md`, `nori.json`, and `.nori-version` are excluded.
 */
export function listSkillAssets(
  root: string,
  fs: FileSystem,
  skills: NoriSkill[]
): SkillAsset[] {
  const assets: SkillAsset[] = [];

  for (const skill of skills) {
    if (skill.dir === "") continue;
    const skillDir = path.join(root, "skills", skill.dir);

    const found: Array<{ filePath: string; relPath: string }> = [];
    for (const sub of SIDECAR_DIRS) {
      walk(path.join(skillDir, sub), fs, skillDir, found);
    }

    // Loose files at the skill root (README.md, LICENSE, …).
    let entries: string[] = [];
    try {
      entries = fs.readdir(skillDir);
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (SIDECAR_DIRS.includes(entry)) continue;
      if (["SKILL.md", "nori.json", ".nori-version"].includes(entry)) continue;
      const full = path.join(skillDir, entry);
      try {
        fs.readdir(full); // it's a directory — skip unmapped skill-asset dirs
        continue;
      } catch {
        found.push({ filePath: full, relPath: entry });
      }
    }

    for (const f of found) {
      assets.push({
        skillName: skill.dir,
        relParent: "",
        filePath: f.filePath,
        relPath: f.relPath,
      });
    }
  }

  return assets;
}

/** Turn assets into file-level copy pairs (`from` source → `to` relative). */
export function copyPlanForAssets(
  assets: SkillAsset[]
): Array<{ group: string; from: string; to: string }> {
  return assets.map((a) => ({
    group: a.skillName === "" ? "root" : a.skillName,
    from: a.filePath,
    to: a.relPath,
  }));
}
