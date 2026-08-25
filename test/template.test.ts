import { describe, expect, it } from "vitest";
import { resolvePlaceholders } from "../src/template/placeholders.ts";
import { selectAgentContent } from "../src/template/agent-conditional.ts";

describe("resolvePlaceholders", () => {
  it("resolves $ARGUMENTS and $1..$9 when args are supplied", () => {
    const text = "Use $ARGUMENTS and $1 with care";
    const result = resolvePlaceholders(text, {
      ARGUMENTS: "all-args",
      "1": "first",
    });
    expect(result.content).toBe("Use all-args and first with care");
  });

  it("preserves documented placeholders when args are missing", () => {
    const text = "Use $ARGUMENTS here";
    const result = resolvePlaceholders(text, {});
    expect(result.content).toBe("Use $ARGUMENTS here");
  });

  it("preserves unknown placeholders literally and warns", () => {
    const text = "Unknown $FOO token";
    const result = resolvePlaceholders(text, {});
    expect(result.content).toBe("Unknown $FOO token");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.detail).toContain("$FOO");
  });
});

describe("selectAgentContent", () => {
  it("is a no-op for content without agent-conditional structure", () => {
    const result = selectAgentContent("# Plain body\nNo conditionals.", "reasonix");
    expect(result.content).toBe("# Plain body\nNo conditionals.");
    expect(result.dropped).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});
