import { describe, expect, it } from "vitest";
import { resolveDependencies, dependencyStubContent } from "../src/dependencies.ts";
import { parseNoriInput } from "../src/manifest/parser.ts";
import { readFixture } from "./helpers.ts";

describe("resolveDependencies", () => {
  it("vendorizes a dependency present in the local store", () => {
    const input = parseNoriInput(readFixture("skillset"));
    // skillset fixture depends on read-the-damn-docs=*
    const exec = (cmd: string, args: string[]) =>
      cmd === "nori-skillsets" && args[1] === "install-location" ? "/fake" : "";
    const fs = {
      readdir: (dir: string) =>
        dir.endsWith("profiles") ? ["active-profile"] : [],
      readFile: (file: string) => {
        if (
          file.includes("read-the-damn-docs") ||
          file.includes("brainstorming")
        ) {
          return "---\nname: x\n---\n# x";
        }
        throw new Error("ENOENT");
      },
    };
    const rs = resolveDependencies(input, exec, fs);
    expect(rs.vendorized).toContain("read-the-damn-docs");
    expect(rs.vendorized).toContain("brainstorming");
    expect(rs.warnings).toHaveLength(0);
  });

  it("stubs a missing dependency with a warning", () => {
    const input = parseNoriInput(readFixture("skillset"));
    const exec = () => "/fake";
    const fs = {
      readdir: () => [],
      readFile: () => {
        throw new Error("ENOENT");
      },
    };
    const rs = resolveDependencies(input, exec, fs);
    expect(rs.stubbed).toContain("read-the-damn-docs");
    expect(rs.warnings.length).toBeGreaterThan(0);
  });

  it("renders a stub SKILL.md with a manual-install note", () => {
    const content = dependencyStubContent("read-the-damn-docs");
    expect(content).toContain("name: read-the-damn-docs");
    expect(content).toContain("install the real");
  });
});
