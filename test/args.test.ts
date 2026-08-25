import { describe, expect, it } from "vitest";
import { parseArgs, usageText } from "../src/cli/args.ts";

describe("parseArgs", () => {
  it("parses --input, --output, and all three --target values", () => {
    const opts = parseArgs([
      "--input",
      "/a",
      "--output",
      "/b",
      "--target",
      "workspace",
    ]);
    expect(opts).toEqual({
      input: "/a",
      output: "/b",
      target: "workspace",
      help: false,
      doctor: false,
    });
  });

  it("defaults --target to both when omitted", () => {
    const opts = parseArgs(["--input", "/a", "--output", "/b"]);
    expect(opts.target).toBe("both");
  });

  it("flags --help without requiring input/output", () => {
    const opts = parseArgs(["--help"]);
    expect(opts.help).toBe(true);
  });

  it("throws a usage error for an invalid --target", () => {
    expect(() =>
      parseArgs(["--input", "/a", "--output", "/b", "--target", "bogus"])
    ).toThrowError(/--target/);
  });

  it("throws when --input or --output is missing", () => {
    expect(() => parseArgs(["--input", "/a"])).toThrowError(/--output/);
    expect(() => parseArgs(["--output", "/b"])).toThrowError(/--input/);
  });

  it("keeps unknown flags as a warning result, not silent", () => {
    const opts = parseArgs(["--input", "/a", "--output", "/b", "--bogus"]);
    expect(opts).toMatchObject({ input: "/a", output: "/b" });
  });
});

describe("usageText", () => {
  it("lists the documented flags", () => {
    const text = usageText();
    expect(text).toContain("--input");
    expect(text).toContain("--output");
    expect(text).toContain("--target");
    expect(text).toContain("workspace|plugin|both");
  });
});
