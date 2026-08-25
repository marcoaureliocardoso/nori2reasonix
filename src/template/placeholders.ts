export interface PlaceholderResult {
  content: string;
  warnings: Array<{ detail: string }>;
}

const DOCUMENTED = new Set(["ARGUMENTS", ..."123456789".split("")]);

/**
 * Resolve Reasonix-documented placeholders ($ARGUMENTS, $1..$9).
 * Unknown placeholders are preserved literally and reported — never dropped.
 */
export function resolvePlaceholders(
  text: string,
  args: Record<string, string>
): PlaceholderResult {
  const warnings: Array<{ detail: string }> = [];

  const content = text.replace(/\$([A-Za-z0-9_]+)/g, (match, name: string) => {
    if (DOCUMENTED.has(name)) {
      return args[name] ?? match;
    }
    warnings.push({ detail: `unresolved placeholder "${match}" preserved` });
    return match;
  });

  return { content, warnings };
}
