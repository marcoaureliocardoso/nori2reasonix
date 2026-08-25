import { describe, expect, it } from "vitest";
import { readFixture } from "./helpers.ts";
import { discoverSkillset } from "../src/manifest/discovery.ts";

describe("discoverSkillset", () => {
  it("discovers skills with frontmatter and raw markdown body", () => {
    const result = discoverSkillset(readFixture("skillset"));
    const skill = result.skills.find((s) => s.name === "brainstorming");
    expect(skill).toBeDefined();
    expect(skill?.name).toBe("brainstorming");
    expect(skill?.frontmatter.description).toBe(
      "Use before creative work - refines ideas into designs"
    );
    expect(skill?.body).toContain("# Brainstorming");
    expect(skill?.body).not.toContain("---");
  });

  it("discovers subagents with tools parsed to a list", () => {
    const result = discoverSkillset(readFixture("skillset"));
    expect(result.subagents).toHaveLength(1);
    const agent = result.subagents[0];
    expect(agent?.name).toBe("fixture-reviewer");
    expect(agent?.frontmatter.tools).toEqual(["Read", "Grep", "Glob"]);
    expect(agent?.frontmatter.model).toBe("inherit");
  });

  it("skips doc files without name frontmatter in subagents/", () => {
    const result = discoverSkillset(readFixture("skillset"));
    // docs.md exists but has no `name:` frontmatter — it is documentation,
    // not a subagent definition.
    expect(result.subagents.some((a) => a.name === "docs")).toBe(false);
  });

  it("discovers slash commands", () => {
    const result = discoverSkillset(readFixture("skillset"));
    expect(result.slashCommands).toHaveLength(1);
    expect(result.slashCommands[0]?.name).toBe("fixture-cmd");
    expect(result.slashCommands[0]?.frontmatter.description).toBe(
      "A fixture slash command"
    );
  });

  it("discovers mcp servers preserving unknown fields", () => {
    const result = discoverSkillset(readFixture("skillset"));
    expect(result.mcp).toHaveLength(1);
    const server = result.mcp[0];
    expect(server?.name).toBe("fixture-server");
    expect(server?.config).toMatchObject({
      mcpServers: {
        "fixture-server": { command: "node" },
      },
    });
  });
});
