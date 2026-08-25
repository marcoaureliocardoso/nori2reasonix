import { describe, expect, it } from "vitest";
import { readFixture } from "./helpers.ts";
import { parseNoriInput } from "../src/manifest/parser.ts";

describe("parseNoriInput", () => {
  it("parses a full skillset combining manifest, discovery, and preserved raw fields", () => {
    const parsed = parseNoriInput(readFixture("skillset"));
    expect(parsed.kind).toBe("skillset");
    expect(parsed.name).toBe("fixture-skillset");
    expect(parsed.version).toBe("1.2.3");
    expect(parsed.rawManifest.dependencies.skills.brainstorming).toBe("1.0.0");
    expect(parsed.rawManifest.dependencies.skills["read-the-damn-docs"]).toBe(
      "*"
    );
    expect(parsed.dependencySkills).toEqual({
      brainstorming: "1.0.0",
      "read-the-damn-docs": "*",
    });
    expect(parsed.skills).toHaveLength(1);
    expect(parsed.subagents).toHaveLength(2);
    expect(parsed.slashCommands).toHaveLength(1);
    expect(parsed.mcp).toHaveLength(1);
    expect(parsed.unknownFields).toEqual({
      someUnknownField: "preserve-me",
    });
  });

  it("detects a standalone skill package (nori.json type=skill)", () => {
    const parsed = parseNoriInput(readFixture("single-skill"));
    expect(parsed.kind).toBe("skill");
    expect(parsed.name).toBe("fixture-single-skill");
    expect(parsed.version).toBe("2.0.0");
    expect(parsed.skills).toHaveLength(1);
    expect(parsed.skills[0]?.body).toContain("# Standalone skill body.");
  });

  it("detects a standalone subagent package (a .md file, no nori.json)", () => {
    const parsed = parseNoriInput(readFixture("single-subagent"));
    expect(parsed.kind).toBe("subagent");
    expect(parsed.name).toBe("fixture-single-subagent");
    expect(parsed.version).toBeNull();
    expect(parsed.subagents).toHaveLength(1);
    expect(parsed.subagents[0]?.frontmatter.tools).toEqual(["Read", "Grep"]);
  });

  it("throws a structured NoriError when nori.json is missing and no skill file exists", () => {
    expect(() => parseNoriInput("/nonexistent/dir")).toThrowError(
      /nor2r\/no-nori-input/
    );
  });
});
