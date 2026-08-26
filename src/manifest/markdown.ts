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

/**
 * Parse a raw `hooks:` block (Claude Code subagent format) into
 * `{ [event]: [entry, ...] }` where each entry carries `matcher` (when
 * present) and a `hooks` array of `{ type, command, args[], timeout }`
 * command objects. Unparsed fragments are skipped, never dropped silently —
 * transform reports a warning when a block yields no command entries.
 */
export function parseHooksBlock(block: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const rawLines = block.split("\n");

  // The flat frontmatter parser preserves nested blocks WITH their original
  // indentation. Normalize by stripping the minimum indentation so the first
  // event key sits at column 0 and everything else is relative to it.
  const nonEmpty = rawLines.filter((l) => l.trim() !== "");
  const minIndent = nonEmpty.reduce(
    (acc, l) => Math.min(acc, l.length - l.trimStart().length),
    Number.POSITIVE_INFINITY
  );
  const lines = nonEmpty.map((l) => ({
    text: l.trim(),
    indent: l.length - l.trimStart().length - minIndent,
  }));

  let event: string | null = null;
  let entry: Record<string, unknown> | null = null;
  let cmd: Record<string, unknown> | null = null;

  for (const { text, indent } of lines) {
    // Event key at column 0: `PreToolUse:`.
    if (indent === 0 && /^[A-Za-z][A-Za-z0-9_]*:$/.test(text)) {
      event = text.slice(0, -1);
      entry = null;
      cmd = null;
      out[event] = [];
      continue;
    }
    if (event === null) continue;

    // Entry dash item at indent 2: `- matcher: Bash` or `- hooks:`.
    if (indent === 2 && /^- /.test(text)) {
      const m = /^- (\w[\w-]*):\s*(.*)$/.exec(text);
      if (m !== null) {
        const key = m[1] ?? "";
        const val = trimQuotes(m[2] ?? "");
        if (key === "hooks") {
          // A matcher-less `- hooks:` starts a NEW entry; never reuse the
          // previous (matcher) entry or the two share one hooks array.
          entry = {};
          entry["hooks"] = [];
          (out[event] as unknown[]).push(entry);
          cmd = null;
        } else {
          entry = { [key]: val };
          (out[event] as unknown[]).push(entry);
          cmd = null;
        }
      }
      continue;
    }

    // Plain `hooks:` that opens the nested command list (no other key does).
    if (indent >= 4 && /^hooks:$/.test(text) && entry !== null) {
      entry["hooks"] = [];
      cmd = null;
      continue;
    }

    // Dash item at deeper indent: `- type: command` starts a command object.
    if (indent >= 4 && /^- /.test(text) && entry !== null) {
      const m = /^- (\w[\w-]*):\s*(.*)$/.exec(text);
      if (m === null) {
        // `- pre` continues the current command's args list.
        if (cmd !== null && Array.isArray(cmd["args"])) {
          (cmd["args"] as unknown[]).push(text.slice(2));
        }
        continue;
      }
      const key = m[1] ?? "";
      const val = trimQuotes(m[2] ?? "");
      cmd = {};
      entry["hooks"] = entry["hooks"] ?? [];
      (entry["hooks"] as unknown[]).push(cmd);
      if (key === "args") {
        // Flow-style `args: [a, b]` (or `- args: [a, b]`) — parse the inline
        // list; block-style `args:` + `- item` lines are appended afterwards.
        cmd["args"] = parseFlowList(val);
      } else {
        cmd[key] = val;
      }
      continue;
    }

    // Plain `key: value` at deeper indent continues the current command.
    if (indent >= 4 && cmd !== null) {
      const m = /^(\w[\w-]*):\s*(.*)$/.exec(text);
      if (m === null) continue;
      const key = m[1] ?? "";
      const val = trimQuotes(m[2] ?? "");
      if (key === "args") {
        cmd["args"] = parseFlowList(val);
      } else {
        cmd[key] = val;
      }
      continue;
    }
  }

  return out;
}

/** Parse a YAML flow list `[a, "b c"]` into a string array, or `[]`.
 * Splits only on commas OUTSIDE quotes so `["a,b"]` stays one item. */
function parseFlowList(value: string): string[] {
  const v = value.trim();
  if (v === "") return [];
  if (v.startsWith("[") && v.endsWith("]")) {
    const inner = v.slice(1, -1).trim();
    if (inner === "") return [];

    const items: string[] = [];
    let current = "";
    let quote: "'" | '"' | null = null;
    for (const ch of inner) {
      if ((ch === "'" || ch === '"') && quote === null) {
        quote = ch;
        current += ch;
      } else if (ch === quote) {
        quote = null;
        current += ch;
      } else if (ch === "," && quote === null) {
        items.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    if (current.trim() !== "") items.push(current.trim());
    return items.map((s) => trimQuotes(s.trim()));
  }
  return [];
}

function trimQuotes(value: string): string {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}
