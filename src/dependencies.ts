import path from "node:path";
import type { FileSystem } from "./manifest/discovery.js";
import type { ParsedNoriInput } from "./manifest/parser.js";
import type { ResolutionSummary } from "./manifest/types.js";

export type Executor = (command: string, args: string[]) => string;

/**
 * Resolve Nori `dependencies.skills` from the LOCAL Nori store only.
 * Outcome per dependency: `vendorized` (found in the local store, copied
 * later), `stubbed` (not found → placeholder skill + warning), or a warning
 * when the store itself is unreachable. Never downloads.
 */
export function resolveDependencies(
  input: ParsedNoriInput,
  exec: Executor,
  fs: FileSystem
): ResolutionSummary {
  const summary: ResolutionSummary = {
    vendorized: [],
    stubbed: [],
    warnings: [],
  };

  const names = Object.keys(input.dependencySkills);
  if (names.length === 0) return summary;

  let installLocation = "";
  try {
    installLocation = exec("nori-skillsets", ["-n", "install-location"]);
  } catch {
    for (const name of names) {
      summary.stubbed.push(name);
      summary.warnings.push({
        entity: name,
        field: "dependencies.skills",
        detail:
          "Nori store unreachable; dependency stubbed (install manually in Reasonix)",
      });
    }
    return summary;
  }

  // Nori profiles live under <installLocation>/.nori/profiles/. Without the
  // active-profile name here, enumerate profile roots and probe each.
  const profilesRoot = path.join(installLocation, ".nori", "profiles");
  let profiles: string[] = [];
  try {
    profiles = fs.readdir(profilesRoot);
  } catch {
    profiles = [];
  }

  for (const name of names) {
    const relative = [name, `${name}/SKILL.md`];
    let found = false;
    for (const profile of profiles) {
      for (const rel of relative) {
        try {
          fs.readFile(path.join(profilesRoot, profile, "skills", name, "SKILL.md"));
          found = true;
          break;
        } catch {
          // keep probing
        }
      }
      if (found) break;
    }
    if (found) {
      summary.vendorized.push(name);
    } else {
      summary.stubbed.push(name);
      summary.warnings.push({
        entity: name,
        field: "dependencies.skills",
        detail:
          "dependency not found in local Nori store; emitting stub skill (no network at convert time)",
      });
    }
  }

  return summary;
}

/** Render a stub SKILL.md for a dependency that cannot be vendorized. */
export function dependencyStubContent(name: string): string {
  return (
    "---\n" +
    `name: ${name}\n` +
    `description: Dependency stub — install the real "${name}" skill manually.\n` +
    "---\n\n" +
    "# (stub) This Nori dependency was not found in the local Nori store.\n"
  );
}
