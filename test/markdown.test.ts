import { describe, expect, it } from "vitest";
import {
  parseHooksBlock,
  parseMarkdown,
  parseSubagentFrontmatter,
} from "../src/manifest/markdown.ts";

describe("parseMarkdown", () => {
  it("returns empty frontmatter and full body when there is no frontmatter", () => {
    const result = parseMarkdown("# Just a heading\n\nNo frontmatter here.\n");
    expect(result.frontmatter).toEqual({});
    expect(result.body).toBe("# Just a heading\n\nNo frontmatter here.\n");
  });

  it("parses scalar frontmatter fields and strips them from the body", () => {
    const raw = "---\nname: brainstorming\ndescription: Use before creative work\n---\n\n# Body\n";
    const result = parseMarkdown(raw);
    expect(result.frontmatter).toEqual({
      name: "brainstorming",
      description: "Use before creative work",
    });
    expect(result.body).toBe("# Body\n");
  });

  it("parses comma-separated list values into arrays", () => {
    const raw = "---\ntools: Read, Grep, Glob\n---\nbody\n";
    const result = parseMarkdown(raw);
    expect(result.frontmatter).toEqual({ tools: ["Read", "Grep", "Glob"] });
  });

  it("preserves unknown YAML constructs as raw strings instead of dropping them", () => {
    const raw = "---\nname: x\nhooks:\n  SessionStart:\n    - matcher: startup\n---\nbody\n";
    const result = parseMarkdown(raw);
    expect(result.frontmatter.name).toBe("x");
    expect(result.frontmatter.hooks).toBe(
      "  SessionStart:\n    - matcher: startup"
    );
  });

  it("tolerates trailing whitespace and a single empty body line", () => {
    const raw = "---\nname: x  \n---\n";
    const result = parseMarkdown(raw);
    expect(result.frontmatter).toEqual({ name: "x" });
    expect(result.body).toBe("");
  });
});

describe("parseSubagentFrontmatter", () => {
  it("parses flat fields and comma lists", () => {
    expect(
      parseSubagentFrontmatter("name: reviewer\ntools: Read, Grep, Bash")
    ).toEqual({ name: "reviewer", tools: ["Read", "Grep", "Bash"] });
  });

  it("parses a nested single-key block into a plain object", () => {
    const fm = parseSubagentFrontmatter(
      "skills:\n  - audit-compliance-evidence\n  - vendor-escalation-management"
    );
    expect(fm.skills).toBeInstanceOf(Array);
    expect(fm.skills).toEqual([
      "audit-compliance-evidence",
      "vendor-escalation-management",
    ]);
  });

  it("parses a nested hooks block into an object without list items", () => {
    const fm = parseSubagentFrontmatter(
      "hooks:\n  PreToolUse:\n    - matcher: Bash\n    - command: bin/guard"
    );
    expect(typeof fm.hooks).toBe("string");
  });
});

describe("parseHooksBlock", () => {
  it("parses the Claude subagent hooks schema into events with commands", () => {
    const block = [
      "PreToolUse:",
      "  - matcher: Bash",
      "    hooks:",
      "      - type: command",
      '        command: "{{skills_dir}}/command-driven-operations/scripts/command-guard-launcher.sh"',
      "        args:",
      "          - pre",
      "        timeout: 7",
    ].join("\n");
    const out = parseHooksBlock(block) as Record<string, unknown>;
    expect(Object.keys(out)).toEqual(["PreToolUse"]);
    const entries = out["PreToolUse"] as unknown[];
    const entry = entries[0] as Record<string, unknown>;
    expect(entry["matcher"]).toBe("Bash");
    const hooks = entry["hooks"] as unknown[];
    const cmd = hooks[0] as Record<string, unknown>;
    expect(cmd["type"]).toBe("command");
    expect(cmd["command"]).toContain("command-guard-launcher.sh");
    expect(cmd["args"]).toEqual(["pre"]);
    expect(cmd["timeout"]).toBe("7");
  });
});
