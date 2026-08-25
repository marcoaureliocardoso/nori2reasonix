import { describe, expect, it } from "vitest";
import { parseMarkdown } from "../src/manifest/markdown.ts";

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
