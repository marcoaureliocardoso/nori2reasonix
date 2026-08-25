import path from "node:path";

export interface NoriSource {
  /** `install-location` resolved profile parent (e.g. /home/marco). */
  installLocation: string;
  /** Active skillset identity as reported by `nori-skillsets current`. */
  active: string;
  /** Absolute path to <installLocation>/.nori/profiles/<active>/nori.json. */
  noriJsonPath: string;
  /** Absolute path to <installLocation>/.nori/profiles. */
  profilesRoot: string;
  /** `<active>` normalized to a filesystem-relative profile path. */
  relative: string;
}

/**
 * Resolve where the active Nori skillset lives, WITHOUT hardcoding `~/.nori`.
 * The install root comes from `nori-skillsets install-location`; the active
 * skillset from `nori-skillsets current`. Profiles live under
 * `<installLocation>/.nori/profiles/`.
 */
export function resolveNoriSource(
  installLocation: string,
  active: string
): NoriSource {
  const profilesRoot = path.join(installLocation, ".nori", "profiles");
  const relative = active.trim().replace(/^\/+|\/+$/g, "");
  return {
    installLocation,
    active,
    noriJsonPath: path.join(profilesRoot, relative, "nori.json"),
    profilesRoot,
    relative,
  };
}
