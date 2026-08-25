import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFixture } from "./helpers.ts";
import { runCli } from "../src/cli/run.ts";

let out: string;
beforeEach(() => {
  out = mkdtempSync(path.join(tmpdir(), "nor2r-cli-"));
});
afterEach(() => {
  rmSync(out, { recursive: true, force: true });
});

const skillsetFixture = readFixture("skillset");

describe("runCli", () => {
  it("emits a workspace for target=workspace", () => {
    const result = runCli({
      input: skillsetFixture,
      output: out,
      target: "workspace",
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(out, ".reasonix", "skills", "brainstorming", "SKILL.md"))).toBe(true);
    expect(result.summary.written.length).toBeGreaterThan(0);
    expect(result.summary.warnings.length).toBe(0);
  });

  it("emits a plugin package for target=plugin", () => {
    const result = runCli({
      input: skillsetFixture,
      output: out,
      target: "plugin",
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(out, "reasonix-plugin.json"))).toBe(true);
  });

  it("emits both for target=both", () => {
    const result = runCli({
      input: skillsetFixture,
      output: out,
      target: "both",
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(out, ".reasonix"))).toBe(true);
    expect(existsSync(path.join(out, "reasonix-plugin.json"))).toBe(true);
  });

  it("returns exit code 3 for an invalid input path", () => {
    const result = runCli({
      input: "/nonexistent/nori-input",
      output: out,
      target: "both",
    });

    expect(result.exitCode).toBe(3);
    expect(result.error).toMatch(/nor2r\//);
  });
});
