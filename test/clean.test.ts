import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planClean } from "../src/clean/plan.ts";
import { executeClean, type CleanOptions } from "../src/clean/run.ts";
import type { DiffEntry } from "../src/doctor/diff.ts";

describe("planClean", () => {
  it("collects candidates from ownership plus stale/drift diff entries, deduped", () => {
    const owned = new Set(["owned-skill"]);
    const diff: DiffEntry[] = [
      { skill: "owned-skill", status: "ok", detail: "" },
      { skill: "stale-skill", status: "stale", detail: "" },
      { skill: "drifted", status: "drift", detail: "" },
      { skill: "missing-skill", status: "missing", detail: "" },
      { skill: "shadowed-skill", status: "shadowed", detail: "" },
    ];

    const candidates = planClean(owned, diff);
    expect(candidates).toEqual(
      expect.arrayContaining(["owned-skill", "stale-skill", "drifted"])
    );
    // missing is not present in the target, shadowed is not removable by clean.
    expect(candidates).not.toContain("missing-skill");
    expect(candidates).not.toContain("shadowed-skill");
    // Deduped: owned-skill appears once.
    expect(candidates.filter((c) => c === "owned-skill")).toHaveLength(1);
  });
});

describe("executeClean", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "nor2r-clean-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function targetPath(name: string): string {
    return path.join(dir, ".reasonix", "skills", name, "SKILL.md");
  }

  function placeOwned(name: string): void {
    mkdirSync(path.dirname(targetPath(name)), { recursive: true });
    writeFileSync(targetPath(name), `content of ${name}`);
    // Record ownership directly (simulating a previous converter run).
    const hash = createHash("sha256").update(`content of ${name}`).digest("hex");
    const files: Record<string, string> = {
      [path.posix.join(".reasonix", "skills", name, "SKILL.md")]: hash,
    };
    writeFileSync(
      path.join(dir, ".nori2reasonix.json"),
      JSON.stringify({ version: 1, files })
    );
  }

  it("dry-run (yes=false) removes nothing but reports candidates", () => {
    placeOwned("owned-skill");
    const result = executeClean(["owned-skill"], { output: dir, yes: false });

    expect(result.executed).toBe(false);
    expect(existsSync(targetPath("owned-skill"))).toBe(true);
    expect(result.planned).toEqual(["owned-skill"]);
  });

  it("yes=true moves owned skills into a timestamped backup", () => {
    placeOwned("owned-skill");
    const result = executeClean(["owned-skill"], { output: dir, yes: true });

    expect(result.executed).toBe(true);
    expect(existsSync(targetPath("owned-skill"))).toBe(false);
    expect(result.backupPaths.length).toBe(1);
    expect(readFileSync(result.backupPaths[0]!, "utf8")).toBe("content of owned-skill");
  });

  it("skips a candidate without ownership unless --force", () => {
    // A skill exists but is NOT in .nori2reasonix.json.
    mkdirSync(path.dirname(targetPath("mystery")), { recursive: true });
    writeFileSync(targetPath("mystery"), "user-owned");

    const noForce = executeClean(["mystery"], { output: dir, yes: true });
    expect(noForce.skipped.length).toBe(1);
    expect(existsSync(targetPath("mystery"))).toBe(true);

    const force = executeClean(["mystery"], {
      output: dir,
      yes: true,
      force: true,
    });
    expect(force.skipped).toEqual([]);
    expect(existsSync(targetPath("mystery"))).toBe(false);
  });
});
