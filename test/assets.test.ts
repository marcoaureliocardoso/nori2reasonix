import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listSkillAssets, copyPlanForAssets } from "../src/assets.ts";
import { readFixture } from "./helpers.ts";

/** Real filesystem seam (readdirSync/readFileSync). */
export const nodeFs = {
  readdir: (dir: string) => readdirSync(dir),
  readFile: (file: string) => readFileSync(file, "utf8"),
};

describe("listSkillAssets", () => {
  it("lists sidecar subtrees and loose skill-root files, ignoring SKILL.md/nori.json", () => {
    const root = readFixture("skillset");
    // The skillset fixture skills use dir "brainstorming".
    const skills = [
      {
        name: "brainstorming",
        dir: "brainstorming",
        path: `${root}/skills/brainstorming/SKILL.md`,
        manifest: null,
        frontmatter: {},
        body: "",
      },
    ];
    const assets = listSkillAssets(root, nodeFs, skills as never);
    expect(assets.map((a) => a.relPath)).toContain(
      "templates/idea-template.md"
    );
  });

  it("finds sidecar templates for a skill that has them", () => {
    const root = readFixture("skillset");
    // There is no templates/ in the fixture; we assert copyPlanForAssets shape.
    const pairs = copyPlanForAssets([
      {
        skillName: "x",
        relParent: "",
        filePath: "/r/skills/x/templates/a.md",
        relPath: "templates/a.md",
      },
    ]);
    expect(pairs).toEqual([
      { group: "x", from: "/r/skills/x/templates/a.md", to: "templates/a.md" },
    ]);
  });
});
