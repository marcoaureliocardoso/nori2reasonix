import { describe, expect, it } from "vitest";
import { transform } from "../src/transform/map.ts";
import { parseNoriInput } from "../src/manifest/parser.ts";
import { renderInventory } from "../src/cli/run.ts";
import { readFixture } from "./helpers.ts";

describe("renderInventory", () => {
  it("summarizes skills, subagents, commands, hooks and warnings", () => {
    const result = transform(parseNoriInput(readFixture("skillset")));
    const text = renderInventory(result, result.warnings.length);
    expect(text).toContain("subagents:");
    expect(text).toContain("commands:");
    expect(text).toContain("warnings:");
  });
});
