import { fileURLToPath } from "node:url";
import path from "node:path";

const testDir = path.dirname(fileURLToPath(import.meta.url));

/** Resolve a fixture directory path relative to the test root. */
export function readFixture(name: string): string {
  return path.join(testDir, "fixtures", name);
}
