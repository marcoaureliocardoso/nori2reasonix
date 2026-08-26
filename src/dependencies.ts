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
    vendorPaths: {},
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
    let found = false;
    for (const profile of profiles) {
      const candidate = path.join(
        profilesRoot,
        profile,
        "skills",
        name,
        "SKILL.md"
      );
      try {
        fs.readFile(candidate);
        summary.vendorized.push(name);
        summary.vendorPaths[name] = candidate;
        found = true;
        break;
      } catch {
        // keep probing other profiles
      }
    }
    if (found) continue;
    summary.stubbed.push(name);
    summary.warnings.push({
      entity: name,
      field: "dependencies.skills",
      detail:
        "dependency not found in local Nori store; emitting stub skill (no network at convert time)",
    });
  }

  return summary;
}

/** Render a stub SKILL.md for a dependency that cannot be vendorized. */
export function dependencyStubContent(name: string): string {
  const slug = name
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^\.+/, "")
    .replace(/^-+|-+$/g, "");
  const safe = slug === "" || slug === "." || slug === ".." ? "skill" : slug;
  return (
    "---\n" +
    `name: ${safe}\n` +
    `description: Dependency stub — install the real "${name}" skill manually.\n` +
    "---\n\n" +
    "# (stub) This Nori dependency was not found in the local Nori store.\n"
  );
}
