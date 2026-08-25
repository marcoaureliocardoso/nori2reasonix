import type { Frontmatter, MarkdownDocument } from "./types.js";

const LIST_VALUE = /^[^\[\]{}"']+$/;

/**
 * Parse a minimal YAML frontmatter block (leading `--- ... ---`).
 *
 * Zero-dependency parser for the scalar/list fields Nori uses. Constructs it
 * cannot parse (nested blocks, inline objects) are preserved as raw strings
 * so no information is silently dropped.
 */
export function parseMarkdown(raw: string): MarkdownDocument {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---")) {
    return { frontmatter: {}, body: normalized };
  }

  const end = normalized.indexOf("\n---", 3);
  if (end === -1) {
    return { frontmatter: {}, body: normalized };
  }

  const block = normalized.slice(3, end);
  let body = normalized.slice(end + 4);
  // Strip the blank line(s) left by the closing delimiter.
  body = body.replace(/^\n+/, "");

  return { frontmatter: parseFrontmatter(block), body };
}

function parseFrontmatter(block: string): Frontmatter {
  const result: Frontmatter = {};
  const lines = block.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (line.trim() === "" || !/^\S/.test(line)) continue;

    const sep = line.indexOf(":");
    if (sep === -1) continue;

    const key = line.slice(0, sep).trim();
    const rawValue = line.slice(sep + 1).trim();

    if (rawValue === "") {
      // A key with no inline value opens a nested block. Capture following
      // indented lines verbatim (original indentation preserved) so no
      // information is lost.
      const nested: string[] = [];
      while (i + 1 < lines.length && /^\s/.test(lines[i + 1] ?? "")) {
        i++;
        nested.push(lines[i] ?? "");
      }
      result[key] = nested.join("\n");
      continue;
    }

    if (rawValue.includes(",") && LIST_VALUE.test(rawValue)) {
      result[key] = rawValue.split(",").map((v) => v.trim());
    } else {
      result[key] = rawValue;
    }
  }

  return result;
}

/**
 * Parse the frontmatter of a Nori subagent definition.
 *
 * Extended beyond `parseFrontmatter` for SUBAGENT.md documents, which carry
 * nested `skills:` lists that the flat parser would otherwise join into raw
 * strings. Scalar/comma-list handling is shared with `parseFrontmatter`;
 * only the nested-list interpretation differs. Anything else (e.g. a nested
 * `hooks:` block) is preserved as a raw string, never dropped.
 */
export function parseSubagentFrontmatter(block: string): Frontmatter {
  const fm = parseFrontmatter(block);

  // A `skills:` list is indented `- value` lines captured as a raw string.
  const skills = fm["skills"];
  if (typeof skills === "string") {
    const items = skills
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2).trim());
    if (items.length > 0 && items.length === skills.split("\n").length) {
      fm["skills"] = items;
    }
  }

  return fm;
}
