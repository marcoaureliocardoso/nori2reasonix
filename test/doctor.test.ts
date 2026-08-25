import { describe, expect, it } from "vitest";
import { resolveNoriSource } from "../src/doctor/source.ts";
import { diffSkillsets } from "../src/doctor/diff.ts";

describe("resolveNoriSource", () => {
  it("resolves source dir from install-location and current, without hardcoding ~/.nori", () => {
    const source = resolveNoriSource("/home/marco", "personal/senior-swe");
    expect(source.noriJsonPath).toContain(
      ".nori/profiles/personal/senior-swe/nori.json"
    );
    expect(source.profilesRoot).toBe("/home/marco/.nori/profiles");
  });

  it("normalizes a bare skillset name into a profile path", () => {
    const source = resolveNoriSource("/x", "senior-swe");
    expect(source.relative).toContain("senior-swe");
  });
});

describe("diffSkillsets", () => {
  const sideA = {
    skills: {
      brainstorming: { hash: "aaa" },
      "read-the-damn-docs": { hash: "bbb" },
    },
  };
  const sideB = {
    skills: new Map([
      ["brainstorming", { path: ".reasonix/skills/brainstorming/SKILL.md", hash: "aaa" }],
      ["stale-skill", { path: ".reasonix/skills/stale-skill/SKILL.md", hash: "ccc" }],
    ]),
  };

  it("flags matching entries as ok", () => {
    const result = diffSkillsets(sideA, sideB);

    const brainstorming = result.find((r) => r.skill === "brainstorming");
    expect(brainstorming?.status).toBe("ok");
  });

  it("flags a source skill missing from the target as missing", () => {
    const result = diffSkillsets(sideA, sideB);

    const docs = result.find((r) => r.skill === "read-the-damn-docs");
    expect(docs?.status).toBe("missing");
  });

  it("flags a target skill absent from the source as stale", () => {
    const result = diffSkillsets(sideA, sideB);

    const stale = result.find((r) => r.skill === "stale-skill");
    expect(stale?.status).toBe("stale");
  });

  it("flags same name with different hash as drift", () => {
    const bDrift = {
      skills: new Map([
        ["brainstorming", { path: "p", hash: "different" }],
      ]),
    };
    const result = diffSkillsets(sideA, bDrift);
    expect(result[0]?.status).toBe("drift");
  });
});
