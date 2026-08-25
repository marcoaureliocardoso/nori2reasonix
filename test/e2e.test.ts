import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseNoriInput } from "../src/manifest/parser.ts";
import { transform } from "../src/transform/map.ts";
import { listSkillAssets } from "../src/assets.ts";
import { nodeFs } from "../src/manifest/discovery.ts";
import { planWorkspace } from "../src/emit-workspace/plan.ts";
import { planPlugin } from "../src/emit-plugin/plan.ts";
import { readFixture } from "./helpers.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "nor2r-e2e-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("rich E2E workspace emit", () => {
  it("emits slugged skills, subagent profile, commands, hooks, assets, REASONIX.md", () => {
    const input = parseNoriInput(readFixture("rich"));
    const result = transform(input);
    const assets = listSkillAssets(readFixture("rich"), nodeFs, input.skills);
    const plan = planWorkspace(dir, result, assets);

    const paths = plan.map((f) => f.path);
    expect(paths.some((p) => p.endsWith("command-driven-operations/SKILL.md"))).toBe(true);
    expect(
      paths.some((p) => p.endsWith("audit-evidence-collector/SKILL.md"))
    ).toBe(true);
    expect(paths.some((p) => p.endsWith("commands/audit-evidence.md"))).toBe(true);
    expect(paths.some((p) => p.endsWith(".reasonix/settings.json"))).toBe(true);
    expect(paths.some((p) => p.endsWith("REASONIX.md"))).toBe(true);
    expect(
      plan.filter((f) => f.kind === "asset").length
    ).toBeGreaterThan(2);

    const agent = plan.find((f) =>
      f.path.endsWith("audit-evidence-collector/SKILL.md")
    );
    expect(agent?.content).toContain("max-iters: 12");
    expect(agent?.content).toContain("runAs: subagent");
  });
});

describe("rich E2E plugin emit", () => {
  it("declares contributes.skills/commands/hooks and emits sidecars + stubs", () => {
    const input = parseNoriInput(readFixture("rich"));
    const result = transform(input);
    const assets = listSkillAssets(readFixture("rich"), nodeFs, input.skills);
    const resolution = {
      vendorized: [],
      vendorPaths: {},
      stubbed: ["read-the-damn-docs"],
      warnings: [],
    };
    const plan = planPlugin(dir, result, resolution, assets);

    const manifest = plan.find((f) => f.path.endsWith("reasonix-plugin.json"));
    const parsed = JSON.parse(manifest!.content);
    expect(parsed.contributes.skills).toEqual(["skills"]);
    expect(parsed.contributes.commands).toEqual(["commands"]);
    expect(parsed.contributes.hooks).toBeDefined();

    expect(
      plan.some((f) => f.path.endsWith("read-the-damn-docs/SKILL.md"))
    ).toBe(true);
    expect(plan.filter((f) => f.kind === "asset").length).toBeGreaterThan(2);
  });
});
