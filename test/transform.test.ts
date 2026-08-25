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

    expect(result.subagents).toHaveLength(2);
    const agent = result.subagents.find((a) => a.name === "fixture-reviewer");
    expect(agent?.runAs).toBe("subagent");
    // Nori "Read, Grep, Glob" -> Reasonix "read_file, grep, glob"
    expect(agent?.allowedTools).toEqual(["read_file", "grep", "glob"]);
  });

  it("uses the subagent nori.json description when frontmatter lacks one", () => {
    const input = parseNoriInput(readFixture("skillset"));
    const result = transform(input);
    // packaged-agent has no frontmatter description; its nori.json does.
    const agent = result.subagents.find((a) => a.name === "packaged-agent");
    expect(agent?.description).toBe(
      "Packaged agent description from its manifest."
    );
  });

  it("maps subagent maxTurns to maxIters and skills list to refs", () => {
    const input = parseNoriInput(readFixture("skillset"));
    const result = transform(input);
    const agent = result.subagents.find((a) => a.name === "packaged-agent");
    expect(agent?.maxIters).toBe(12);
    expect(agent?.skillRefs).toEqual(["brainstorming", "root-cause-analysis"]);
  });

  it("warns on disallowedTools and non-inherit model", () => {
    const input = parseNoriInput(readFixture("skillset"));
    const a = input.subagents.find((a) => a.name === "fixture-reviewer");
    a!.frontmatter.disallowedTools = ["Write", "Edit"];
    a!.frontmatter.model = "deepseek-pro";
    const result = transform(input);
    expect(
      result.warnings.filter((w) => w.field === "disallowedTools")
    ).toHaveLength(2);
    expect(
      result.warnings.some(
        (w) => w.field === "model" && w.detail.includes("deepseek-pro")
      )
    ).toBe(true);
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

  it("maps subagent role hooks into Reasonix events and renames matcher to match", () => {
    const input = parseNoriInput(readFixture("skillset"));
    const result = transform(input);
    const hooks = result.hooks as Record<string, unknown[]>;
    const pre = hooks["PreToolUse"] as Array<Record<string, unknown>>;
    expect(pre?.length).toBeGreaterThan(0);
    expect(pre?.[0]?.match).toBe("bash|Bash");
    expect(String(pre?.[0]?.command)).toContain("command-guard-launcher.sh");
    expect(String(pre?.[0]?.command)).not.toContain("{{skills_dir}}");
    expect(pre?.[0]?.timeout).toBe(7);
  });

  it("slugs skill names and preserves the original title as description", () => {
    const input = parseNoriInput(readFixture("skillset"));
    // One space-titled skill at runtime (no extra fixture file needed).
    input.skills.push({
      name: "Audit and Compliance Evidence Collection",
      frontmatter: { name: "Audit and Compliance Evidence Collection" },
      body: "# Audit\n",
      path: "/fake/skills/audit/SKILL.md",
      dir: "audit-compliance-evidence",
      manifest: null,
    });
    const result = transform(input);
    // dir is the canonical slug and wins over the space-titled name.
    const skill = result.skills.find(
      (s) => s.name === "audit-compliance-evidence"
    );
    expect(skill).toBeDefined();
    expect(skill?.frontmatter.name).toBe("audit-compliance-evidence");
    expect(skill?.frontmatter.description).toBe(
      "Audit and Compliance Evidence Collection"
    );
  });

  it("rewrites relative sidecar references to emitted canonical paths", () => {
    const input = parseNoriInput(readFixture("skillset"));
    input.skills.push({
      name: "audit-compliance-evidence",
      frontmatter: { name: "audit-compliance-evidence" },
      body: "Use `templates/audit-evidence-record.md` and `references/risk-levels.md`.",
      path: "/x/SKILL.md",
      dir: "audit-compliance-evidence",
      manifest: null,
    });
    const result = transform(input);
    const skill = result.skills.find(
      (s) => s.name === "audit-compliance-evidence"
    );
    expect(skill?.body).toContain("./templates/audit-evidence-record.md");
    expect(skill?.body).toContain("./references/risk-levels.md");
  });
});
