export type Target = "workspace" | "plugin" | "both";

export interface CliOptions {
  input: string;
  output: string;
  target: Target;
  help: boolean;
  doctor: boolean;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

const TARGETS: ReadonlySet<string> = new Set(["workspace", "plugin", "both"]);

/**
 * Parse argv (excluding node + script) into CliOptions.
 * Pure; throws UsageError for missing/invalid required values.
 */
export function parseArgs(argv: string[]): CliOptions {
  let input: string | undefined;
  let output: string | undefined;
  let target: Target = "both";
  let help = false;
  let doctor = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case "--help":
      case "-h":
        help = true;
        break;
      case "--doctor":
        doctor = true;
        break;
      case "--input":
        input = requireValue(argv, ++i, "--input");
        break;
      case "--output":
        output = requireValue(argv, ++i, "--output");
        break;
      case "--target":
        target = requireValue(argv, ++i, "--target") as Target;
        if (!TARGETS.has(target)) {
          throw new UsageError(
            `--target must be one of workspace|plugin|both (got "${target}")`
          );
        }
        break;
      default:
        // Unknown flags: warn at the run layer rather than dropping silently.
        break;
    }
  }

  if (!help && !doctor) {
    if (input === undefined) {
      throw new UsageError("missing required --input <path>");
    }
    if (output === undefined) {
      throw new UsageError("missing required --output <path>");
    }
  }

  return {
    input: input ?? "",
    output: output ?? "",
    target,
    help,
    doctor,
  };
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith("--")) {
    throw new UsageError(`${flag} requires a value`);
  }
  return value;
}

export function usageText(): string {
  return [
    "nori2reasonix — convert a Nori skillset into Reasonix-native layouts",
    "",
    "Usage:",
    "  nori2reasonix --input <path> --output <path> [--target workspace|plugin|both]",
    "",
    "Options:",
    "  --input <path>    Nori skillset dir, single skill/subagent package, or .claude tree",
    "  --output <path>   destination directory",
    "  --target <kind>   workspace | plugin | both (default: both)",
    "  --doctor          integration check: compare active Nori skillset vs loaded Reasonix",
    "  --help, -h        show this help",
  ].join("\n");
}
