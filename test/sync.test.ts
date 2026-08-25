import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planSync, type SyncAction } from "../src/sync/plan.ts";
import { executeSync, type SyncResult } from "../src/sync/run.ts";

describe("planSync", () => {
  it("maps missing → emit, drift → re-emit, stale → remove, ok → none", () => {
    const actions = planSync([
      { skill: "present", status: "ok", detail: "" },
      { skill: "missing-skill", status: "missing", detail: "" },
      { skill: "drifted", status: "drift", detail: "" },
      { skill: "stale-skill", status: "stale", detail: "" },
      { skill: "shadowed-skill", status: "shadowed", detail: "" },
    ]);

    const bySkill = (name: string) => actions.find((a) => a.skill === name);

    expect(actions.find((a) => a.skill === "present")).toBeUndefined();
    expect(bySkill("missing-skill")?.action).toBe("emit");
    expect(bySkill("drifted")?.action).toBe("re-emit");
    expect(bySkill("stale-skill")?.action).toBe("remove");
    // shadowed cannot be auto-fixed; it becomes a warning, not an action.
    expect(bySkill("shadowed-skill")).toBeUndefined();
  });
});

describe("executeSync", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "nor2r-sync-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function targetPath(name: string): string {
    return path.join(dir, ".reasonix", "skills", name, "SKILL.md");
  }

  it("dry-run (yes=false) writes nothing and reports the plan", () => {
    const actions: SyncAction[] = [
      { skill: "missing-skill", action: "emit" },
    ];
    const result = executeSync(actions, { output: dir, yes: false });

    expect(result.executed).toBe(false);
    expect(existsSync(targetPath("missing-skill"))).toBe(false);
    expect(result.planned).toHaveLength(1);
  });

  it("yes=true emits missing skills", () => {
    // Provide content via a stub emit hook: the executor reuses the source
    // parser; here we verify the filesystem effect through the plan.
    const actions: SyncAction[] = [{ skill: "missing-skill", action: "emit" }];
    // Place the source skill content where the executor would emit from.
    const sourceSkills = path.join(dir, "src-skills", "missing-skill");
    mkdirSync(sourceSkills, { recursive: true });
    writeFileSync(path.join(sourceSkills, "SKILL.md"), "---\nname: missing-skill\ndescription: x\n---\nbody\n");

    const result = executeSync(actions, {
      output: dir,
      yes: true,
      sourceSkillDir: path.join(dir, "src-skills"),
    });

    expect(result.executed).toBe(true);
    expect(existsSync(targetPath("missing-skill"))).toBe(true);
    expect(readFileSync(targetPath("missing-skill"), "utf8")).toContain("name: missing-skill");
  });

  it("removes stale skills into a backup, not into the void", () => {
    mkdirSync(path.dirname(targetPath("stale-skill")), { recursive: true });
    writeFileSync(targetPath("stale-skill"), "old content");

    const result = executeSync(
      [{ skill: "stale-skill", action: "remove" }],
      { output: dir, yes: true }
    );

    expect(result.executed).toBe(true);
    // Original gone…
    expect(existsSync(targetPath("stale-skill"))).toBe(false);
    // …but a backup exists somewhere under .nori2reasonix/backup.
    const backups = result.backupPaths;
    expect(backups.length).toBe(1);
    expect(readFileSync(backups[0]!, "utf8")).toBe("old content");
  });

  it("skips re-emitting a drifted file that is not ours, unless --force", () => {
    const sourceSkillDir = path.join(dir, "src-skills");
    const sourceSkill = path.join(sourceSkillDir, "drifted");
    mkdirSync(sourceSkill, { recursive: true });
    writeFileSync(path.join(sourceSkill, "SKILL.md"), "new content");

    // A user file (not owned) already exists at the target.
    mkdirSync(path.dirname(targetPath("drifted")), { recursive: true });
    writeFileSync(targetPath("drifted"), "user edited content");

    const action: SyncAction = { skill: "drifted", action: "re-emit" };

    // Without --force: skip (never overwrite a non-owned file).
    const noForce = executeSync([action], {
      output: dir,
      yes: true,
      sourceSkillDir,
    });
    expect(noForce.skipped.length).toBeGreaterThan(0);
    expect(readFileSync(targetPath("drifted"), "utf8")).toBe("user edited content");

    // With --force: overwrite (user assumes max risk).
    const force = executeSync([action], {
      output: dir,
      yes: true,
      force: true,
      sourceSkillDir,
    });
    expect(force.skipped).toEqual([]);
    expect(readFileSync(targetPath("drifted"), "utf8")).toBe("new content");
  });

  it("still re-emits a drifted file we own (from .nori2reasonix.json)", () => {
    const sourceSkillDir = path.join(dir, "src-skills");
    mkdirSync(path.join(sourceSkillDir, "drifted-owned"), { recursive: true });
    writeFileSync(path.join(sourceSkillDir, "drifted-owned", "SKILL.md"), "new content");

    // Place a target that a PREVIOUS converter run owned: the ownership
    // file records the hash of the current content.
    const target = targetPath("drifted-owned");
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, "previous content");
    const currentHash = createHash("sha256")
      .update("previous content")
      .digest("hex");
    writeFileSync(
      path.join(dir, ".nori2reasonix.json"),
      JSON.stringify({
        version: 1,
        files: { ".reasonix/skills/drifted-owned/SKILL.md": currentHash },
      })
    );

    const result = executeSync(
      [{ skill: "drifted-owned", action: "re-emit" }],
      { output: dir, yes: true, sourceSkillDir }
    );
    expect(result.skipped).toEqual([]);
    expect(readFileSync(target, "utf8")).toBe("new content");
  });
});
