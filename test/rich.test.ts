import { describe, expect, it } from "vitest";
import { readFixture } from "./helpers.ts";
import { discoverSkillset } from "../src/manifest/discovery.ts";
import { parseNoriInput } from "../src/manifest/parser.ts";
import { transform } from "../src/transform/map.ts";
import { listSkillAssets } from "../src/assets.ts";
import { nodeFs } from "../src/manifest/discovery.ts";

describe("rich fixture", () => {
  it("discovers 3 skills, 2 subagents (dir + flat), 2 commands", () => {
    const result = discoverSkillset(readFixture("rich"));
    expect(result.skills).toHaveLength(3);
    expect(result.subagents).toHaveLength(2);
    expect(result.slashCommands).toHaveLength(2);
  });

  it("parses assets: sidecars found, SKILL.md/nori.json excluded", () => {
    const input = parseNoriInput(readFixture("rich"));
    const assets = listSkillAssets(readFixture("rich"), nodeFs, input.skills);
    const rels = assets.map((a) => a.relPath);
    expect(rels).toContain("scripts/command-guard-launcher.sh");
    expect(rels).toContain("templates/guard-template.md");
    expect(rels).toContain("templates/audit-evidence-record.md");
    expect(rels).not.toContain("SKILL.md");
  });

  it("transforms to slugs, subagent metadata, and non-empty hooks", () => {
    const result = transform(parseNoriInput(readFixture("rich")));
    expect(result.skills.map((s) => s.name)).toContain(
      "command-driven-operations"
    );
    const agent = result.subagents.find(
      (a) => a.name === "audit-evidence-collector"
    );
    expect(agent?.maxIters).toBe(12);
    expect(agent?.skillRefs).toContain("audit-compliance-evidence");
    expect(Object.keys(result.hooks).length).toBeGreaterThan(0);
  });
});
