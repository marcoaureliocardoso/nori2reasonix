import { describe, expect, it } from "vitest";

describe("scaffold", () => {
  it("loads the TypeScript toolchain", () => {
    // If vitest runs this file, the TS toolchain compiles and executes.
    expect(1 + 1).toBe(2);
  });
});
