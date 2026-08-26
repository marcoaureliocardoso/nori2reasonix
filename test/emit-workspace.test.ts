import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseNoriInput } from "../src/manifest/parser.ts";
import { transform } from "../src/transform/map.ts";
import { planWorkspace } from "../src/emit-workspace/plan.ts";
import { writeWorkspace } from "../src/emit-workspace/writer.ts";
import { listSkillAssets } from "../src/assets.ts";
import { nodeFs } from "../src/manifest/discovery.ts";
import { readFixture } from "./helpers.ts";

function fixtureResult() {
  return transform(parseNoriInput(readFixture("skillset")));
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "nor2r-emit-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("planWorkspace", () => {
  it("produces the expected .reasonix tree with correct paths and content", () => {
    const plan = planWorkspace(dir, fixtureResult());

    const paths = plan.map((f) => f.path).sort();
    expect(paths).toContain(path.join(dir, "REASONIX.md"));
    expect(paths).toContain(
      path.join(dir, ".reasonix", "skills", "brainstorming", "SKILL.md")
    );
    expect(paths).toContain(
      path.join(dir, ".reasonix", "commands", "fixture-cmd.md")
    );
    expect(paths).toContain(path.join(dir, ".mcp.json"));

    const skill = plan.find((f) => f.path.endsWith("brainstorming/SKILL.md"));
    expect(skill?.content).toContain("name: brainstorming");
    expect(skill?.content).toContain("# Brainstorming");
  });

  it("copies skill sidecar assets next to emitted skills", () => {
    const input = parseNoriInput(readFixture("skillset"));
    const assets = listSkillAssets(readFixture("skillset"), nodeFs, input.skills);
    const result = transform(input);
    const plan = planWorkspace(dir, result, assets);
    const assetFiles = plan.filter((f) => f.kind === "asset");
    expect(assetFiles.length).toBeGreaterThan(0);
    expect(
      assetFiles.some((f) => f.path.endsWith("templates/idea-template.md"))
    ).toBe(true);
  });

  it("emits max-iters, allowed-tools, and preload body for subagents", () => {
    const plan = planWorkspace(dir, fixtureResult());
    const agentFile = plan.find((f) =>
      f.path.endsWith("packaged-agent/SKILL.md")
    );
    expect(agentFile?.content).toContain("runAs: subagent");
    expect(agentFile?.content).toContain("max-iters: 12");
    expect(agentFile?.content).toContain("allowed-tools: read_file");
    expect(agentFile?.content).toContain("brainstorming");
  });

  it("emits .reasonix/settings.json with mapped hooks when present", () => {
    const plan = planWorkspace(dir, fixtureResult());
    const settings = plan.find((f) => f.path.endsWith("settings.json"));
    expect(settings).toBeDefined();
    expect(settings?.content).toContain('"PreToolUse"');
    expect(settings?.content).toContain('"PreCompact"');
    expect(settings?.content).toContain('"match"');
  });

  it("preserves ${VAR} literals in .mcp.json", () => {
    const plan = planWorkspace(dir, fixtureResult());
    const mcp = plan.find((f) => f.path.endsWith(".mcp.json"));
    expect(mcp?.content).toContain("${FIXTURE_API_KEY}");
  });
});

describe("writeWorkspace", () => {
  it("writes all planned files and records ownership in .nori2reasonix.json", () => {
    const plan = planWorkspace(dir, fixtureResult());
    const result = writeWorkspace(plan);

    expect(result.skipped).toEqual([]);
    expect(result.written).toHaveLength(plan.length);

    const ownership = readFileSync(
      path.join(dir, ".nori2reasonix.json"),
      "utf8"
    );
    expect(ownership).toContain("brainstorming");
    expect(ownership).toContain("version");
  });

  it("is idempotent: a second run rewrites our files and does not duplicate", () => {
    const plan = planWorkspace(dir, fixtureResult());
    writeWorkspace(plan);
    const second = writeWorkspace(plan);

    expect(second.written).toHaveLength(plan.length);
    expect(second.skipped).toEqual([]);
  });

  it("skips (never overwrites) a user file that collides with a target", () => {
    // Create a controlled directory with a pre-existing user file at a
    // planned target path.
    const controlled = mkdtempSync(path.join(tmpdir(), "nor2r-emit-ctrl-"));
    const target = path.join(
      controlled,
      ".reasonix",
      "skills",
      "brainstorming",
      "SKILL.md"
    );
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, "user content", { encoding: "utf8" });

    const plan = planWorkspace(controlled, fixtureResult());
    const result = writeWorkspace(plan);

    const collided = result.skipped.some((s) => s.endsWith("SKILL.md"));
    expect(collided).toBe(true);
    expect(readFileSync(target, "utf8")).toBe("user content");

    rmSync(controlled, { recursive: true, force: true });
  });
});
