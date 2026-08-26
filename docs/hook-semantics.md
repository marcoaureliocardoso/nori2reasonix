# Hook semantics: Nori/Claude → Reasonix

The `senior-infra-ops-analyst` command guard returns `allow | ask | deny` per
candidate Bash call. Reasonix `PreToolUse` hooks have only two outcomes:
exit 0 (allow) and exit 2 (block; stderr fed back to the model).

**Policy (fail-closed).** `allow` proceeds. `ask`, `deny`, unknown, and any
guard crash/timeout **block** the call (exit 2), and the guard's stderr
message tells the executor to reformulate the command. There is no hook-level
"prompt the operator" channel in Reasonix today.

This is a documented capability degradation, surfaced as a conversion warning:
`hooks.ask-semantics: Nori 'ask' degrades to deny in Reasonix — operator
approval must come from reasonix.toml permission rules / sandbox, not hooks.`

## Why not emulate `ask`

An `ask` hook decision with no operator to answer must fail closed; emitting
exit 0 on `ask` would silently broaden authority (the opposite of the guard's
purpose). Emitting exit 2 keeps the invariant "no unapproved destructive call".

## What the converter emits

- `matcher` → `match` (anchored via `TOOL_NAME_MAP`; `Bash`→`bash|Bash`,
  `Write`→`write_file|Write`, …).
- `{type:"command", command, args[]}` → one `command` string (args shell-quoted).
- `{{skill_dir}}` / `{{skills_dir}}` → the target's emitted skills root
  (`.reasonix/skills` for workspace, `skills` for plugin).
- `timeout` (Nori/Claude **seconds**) converted to Reasonix **milliseconds**;
  default 5000 ms for gating events, 30000 ms for all others.
- Unmapped hook fields (`permissionDecision`, `updatedInput`,
  `hookSpecificOutput`) are warnings, never silent drops.
