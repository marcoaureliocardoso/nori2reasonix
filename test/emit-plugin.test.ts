import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseNoriInput } from "../src/manifest/parser.ts";
import { transform } from "../src/transform/map.ts";
import { planPlugin } from "../src/emit-plugin/plan.ts";
import { writePlugin } from "../src/emit-plugin/writer.ts";
import { readFixture } from "./helpers.ts";

function fixtureResult() {
  return transform(parseNoriInput(readFixture("skillset")));
}

function emptyResolution() {
  return { vendorized: [], stubbed: [], warnings: [] };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "nor2r-plugin-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("planPlugin", () => {
  it("emits a native v2 reasonix-plugin.json with apiVersion and contributes paths", () => {
    const plan = planPlugin(dir, fixtureResult(), emptyResolution());
    const manifest = plan.find((f) => f.path.endsWith("reasonix-plugin.json"));
    expect(manifest).toBeDefined();

    const parsed = JSON.parse(manifest!.content);
    expect(parsed.apiVersion).toBe("reasonix.io/plugin/v2");
    expect(parsed.name).toBe("fixture-skillset");
    expect(parsed.version).toBe("1.2.3");
    // contributes.<kind> are arrays of directory paths (canonical v2 shape).
    expect(parsed.contributes.skills).toEqual(["skills"]);
    expect(parsed.contributes.commands).toEqual(["commands"]);
  });

  it("emits a Claude compatibility manifest .claude-plugin/plugin.json", () => {
    const plan = planPlugin(dir, fixtureResult(), emptyResolution());
    const claude = plan.find((f) =>
      f.path.endsWith(".claude-plugin/plugin.json")
    );
    expect(claude).toBeDefined();

    const parsed = JSON.parse(claude!.content);
    expect(parsed.name).toBe("fixture-skillset");
    expect(parsed.version).toBe("1.2.3");
  });

  it("writes skills into the plugin skills/ tree with correct location", () => {
    const plan = planPlugin(dir, fixtureResult(), emptyResolution());
    const skill = plan.find((f) =>
      f.path.endsWith("skills/brainstorming/SKILL.md")
    );
    expect(skill).toBeDefined();
    expect(skill?.content).toContain("name: brainstorming");
  });
});

describe("writePlugin", () => {
  it("writes all planned plugin files", () => {
    const plan = planPlugin(dir, fixtureResult(), emptyResolution());
    const result = writePlugin(plan);

    expect(result.skipped).toEqual([]);
    expect(result.written.length).toBe(plan.length);
  });

  it("is idempotent and ownership-tracked", () => {
    const plan = planPlugin(dir, fixtureResult(), emptyResolution());
    writePlugin(plan);
    const second = writePlugin(plan);
    expect(second.written.length).toBe(plan.length);
    expect(second.skipped).toEqual([]);
  });
});
