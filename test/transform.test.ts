import { describe, expect, it } from "vitest";
import { parseNoriInput } from "../src/manifest/parser.ts";
import { transform } from "../src/transform/map.ts";
import { readFixture } from "./helpers.ts";

describe("transform", () => {
  it("maps a Nori skill to a Reasonix skill with frontmatter and body preserved", () => {
    const input = parseNoriInput(readFixture("skillset"));
    const result = transform(input);

    expect(result.skills).toHaveLength(1);
    const skill = result.skills[0];
    expect(skill?.name).toBe("brainstorming");
    expect(skill?.frontmatter.description).toBe(
      "Use before creative work - refines ideas into designs"
    );
    expect(skill?.body).toContain("# Brainstorming");
    // Reasonix inline is the default — we must not emit runAs for plain skills.
    expect(skill?.frontmatter.runAs).toBeUndefined();
  });

  it("maps a Nori subagent to a Reasonix subagent skill with runAs and mapped tools", () => {
    const input = parseNoriInput(readFixture("skillset"));
    const result = transform(input);

    expect(result.subagents).toHaveLength(1);
    const agent = result.subagents[0];
    expect(agent?.name).toBe("fixture-reviewer");
    expect(agent?.runAs).toBe("subagent");
    // Nori "Read, Grep, Glob" -> Reasonix "read_file, grep, glob"
    expect(agent?.allowedTools).toEqual(["read_file", "grep", "glob"]);
  });

  it("warns but does not drop a tool name with no mapping", () => {
    const input = parseNoriInput(readFixture("skillset"));
    // Inject an unmapped tool into the subagent's frontmatter.
    input.subagents[0]!.frontmatter.tools = ["Read", "MadeUpTool"];
    const result = transform(input);

    expect(result.subagents[0]?.allowedTools).toContain("read_file");
    expect(result.subagents[0]?.allowedTools).not.toContain("MadeUpTool");
    expect(
      result.warnings.some(
        (w) => w.field === "tools" && w.detail.includes("MadeUpTool")
      )
    ).toBe(true);
  });

  it("maps a Nori slash command preserving $ARGUMENTS and description", () => {
    const input = parseNoriInput(readFixture("skillset"));
    const result = transform(input);

    expect(result.commands).toHaveLength(1);
    const cmd = result.commands[0];
    expect(cmd?.name).toBe("fixture-cmd");
    expect(cmd?.frontmatter.description).toBe("A fixture slash command");
    expect(cmd?.body).toContain("fixture-reviewer");
  });

  it("passes MCP servers through preserving ${VAR} placeholders", () => {
    const input = parseNoriInput(readFixture("skillset"));
    const result = transform(input);

    expect(result.mcp).toHaveLength(1);
    const mcp = JSON.stringify(result.mcp[0]);
    expect(mcp).toContain('"fixture-server"');
    expect(mcp).toContain("${FIXTURE_API_KEY}");
  });

  it("emits no warnings for a fully-mappable skillset", () => {
    const input = parseNoriInput(readFixture("skillset"));
    const result = transform(input);
    expect(result.warnings).toEqual([]);
  });
});
