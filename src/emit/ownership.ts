import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface OwnedWrite {
  /** Absolute target path. */
  path: string;
  content: string;
}

export interface OwnedWriteResult {
  written: string[];
  skipped: string[];
}

const OWNERSHIP_FILE = ".nori2reasonix.json";

/**
 * Ownership-tracked file writer shared by all emitters.
 * Idempotent: files we own are rewritten; user files are never overwritten.
 */
export function writeOwned(
  plan: OwnedWrite[],
  root: string,
  ownershipFile: string = OWNERSHIP_FILE
): OwnedWriteResult {
  const ownershipPath = path.join(root, ownershipFile);
  const owned = loadOwnership(ownershipPath);

  const result: OwnedWriteResult = { written: [], skipped: [] };
  const nextOwned: Record<string, string> = {};

  for (const file of plan) {
    const rel = path.relative(root, file.path);
    const hash = sha256(file.content);

    let existing: string | null = null;
    try {
      existing = readFileSync(file.path, "utf8");
    } catch {
      existing = null;
    }

    if (existing === null) {
      mkdirSync(path.dirname(file.path), { recursive: true });
      writeFileSync(file.path, file.content);
      nextOwned[rel] = hash;
      result.written.push(file.path);
    } else if (owned[rel] === sha256(existing)) {
      writeFileSync(file.path, file.content);
      nextOwned[rel] = hash;
      result.written.push(file.path);
    } else {
      result.skipped.push(file.path);
    }
  }

  mkdirSync(root, { recursive: true });
  writeFileSync(
    ownershipPath,
    JSON.stringify({ version: 1, files: { ...owned, ...nextOwned } }, null, 2) +
      "\n"
  );

  return result;
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function loadOwnership(ownershipPath: string): Record<string, string> {
  try {
    const raw = JSON.parse(readFileSync(ownershipPath, "utf8")) as {
      files?: Record<string, string>;
    };
    return raw.files ?? {};
  } catch {
    return {};
  }
}
