# nori2reasonix

Converter that translates any [Nori Skillset](https://noriskillsets.dev) package/skill into
[Reasonix](https://github.com/esengine/DeepSeek-Reasonix)-native layouts, with read-only
verification (`--doctor`), forced synchronization (`--sync`), and cleanup (`--clean`).

Zero runtime dependencies · Node.js ≥ 22 · TypeScript · MIT.

---

## What problem it solves

Nori lets you manage *skillsets* and switch between them with
`nori-skillsets switch <name>`. Reasonix consumes skills from its own
directories (`.reasonix/skills`, `.reasonix/commands`, `REASONIX.md`, hooks,
`.mcp.json`) and from plugin packages (`reasonix-plugin.json`).

`nori2reasonix` is the bridge between the two. It answers four questions:

1. **Convert** — "generate a Reasonix workspace/plugin from this Nori skillset."
2. **Verify** — "does the Reasonix workspace faithfully mirror the *currently active*
   Nori skillset?"
3. **Synchronize** — "force the workspace back in sync, assuming the risks, with backups."
4. **Clean** — "remove Nori-owned skills from the workspace, assuming the outcome, with backups."

---

## Installation

```bash
npm install        # dev dependencies (typescript, vitest)
npm run build      # compile TypeScript → dist/
```

Run directly from the checkout:

```bash
node bin/nori2reasonix --help
```

Or install globally so `nori2reasonix` is on `PATH`:

```bash
npm install -g .
nori2reasonix --help
```

## Commands

### Convert

```bash
node bin/nori2reasonix --input <path> --output <path> [--target workspace|plugin|both]
```

`--input` accepts any of:

- a **Nori skillset directory** (`nori.json` + `skills/`, `subagents/`,
  `slashcommands/`, `mcp/`, `AGENTS.md`/`CLAUDE.md`)
- a **single skill package** (a directory whose `nori.json` has `"type": "skill"`)
- a **single subagent package** (a directory holding one `.md` file with
  frontmatter `name`, no `nori.json`)

`--target` selects the output form (default `both`):

#### `--target workspace`

Emits a Reasonix-native workspace tree:

```
<output>/
├── REASONIX.md                       # from the skillset's AGENTS.md / CLAUDE.md
├── .reasonix/
│   ├── skills/<name>/SKILL.md        # skills + subagents (runAs: subagent)
│   ├── commands/<name>.md            # slash commands
│   └── settings.json                 # hooks (only when present)
└── .mcp.json                         # MCP servers (only when present)
└── .nori2reasonix.json               # ownership manifest (sha256 per file)
```

#### `--target plugin`

Emits a Reasonix plugin package:

```
<output>/
├── reasonix-plugin.json              # native v2 manifest
├── .claude-plugin/plugin.json        # Claude compatibility manifest
├── skills/<name>/SKILL.md
├── commands/<name>.md
└── .mcp.json
```

The native manifest uses the canonical v2 shape:

```json
{
  "apiVersion": "reasonix.io/plugin/v2",
  "name": "senior-swe",
  "version": "1.0.2",
  "description": "…",
  "contributes": {
    "skills": ["skills"],
    "commands": ["commands"]
  }
}
```

### Verify — `--doctor`

```bash
node bin/nori2reasonix --doctor
```

Read-only integration check. It resolves the active Nori skillset via the
canonical CLI (`nori-skillsets install-location` + `nori-skillsets current` —
never a hardcoded `~/.nori`), loads what Reasonix actually discovers
(`reasonix doctor capabilities --json`), and reports every skill as:

| Status    | Meaning |
|-----------|---------|
| `ok`      | same name, same content in both |
| `missing` | in the active Nori source, not loaded by Reasonix |
| `stale`   | loaded by Reasonix, absent from the active Nori source |
| `drift`   | same name, different content |
| `shadowed`| discovered but overridden by a higher-scope skill (reported, not fixable automatically) |

Output is JSON + a human summary. Exit codes: `0` in sync, `1` divergence,
`3` source unavailable.

### Synchronize — `--sync`

```bash
node bin/nori2reasonix --sync            # DRY-RUN: show the plan, touch nothing
node bin/nori2reasonix --sync --yes      # execute (assume the risks)
node bin/nori2reasonix --sync --yes --force  # also overwrite drifted user files
```

Actions derived from the diff:

| Diff | Action |
|------|--------|
| `missing` | `emit` — write the skill from the Nori source |
| `drift`   | `re-emit` — overwrite *only* files we own (or any file with `--force`) |
| `stale`   | `remove` — move into `.nori2reasonix/backup/<timestamp>/` (recoverable) |
| `shadowed`| warning only — not auto-correctable (scope decision belongs to the user) |

Safety properties:

- **Dry-run by default** — `--sync` without `--yes` never writes.
- **Ownership respected** — `.nori2reasonix.json` records sha256 hashes of
  everything the converter wrote; `re-emit` refuses to overwrite a file it
  does not own unless `--force` is explicit.
- **Removals are moves** — `stale` files are renamed into a timestamped
  backup, never deleted.
- **Nori and Claude are untouched** — sync reads the Nori profile and writes
  only to `<output>/.reasonix/` (plus backups inside it). It never modifies
  the Nori store or `~/.claude/`.

### Clean — `--clean`

```bash
node bin/nori2reasonix --clean                    # DRY-RUN: list what would go, touch nothing
node bin/nori2reasonix --clean --yes              # execute (assume the outcome)
node bin/nori2reasonix --clean --yes --force      # also remove skills not in ownership
```

Removes Nori-owned skills from the Reasonix workspace. A skill qualifies as
*Nori-owned* when it is **recorded in `.nori2reasonix.json`** (the converter
wrote it) or the `--doctor` diff marks it **`stale` / `drift`**
(different from, or absent in, the active Nori source). `missing` and
`shadowed` are not candidates — the former is not on disk, the latter is a
scope decision.

Safety properties:

- **Dry-run by default** — `--clean` without `--yes` never removes.
- **Ownership respected** — a candidate not recorded in ownership is skipped
  unless `--force` is explicit.
- **Removals are moves** — each file is renamed into
  `.nori2reasonix/backup/<timestamp>/`, never deleted.
- **Only `.reasonix/` is touched** — `--clean` never writes to the Nori store
  or `~/.claude/`.

---

## How it works internally

The pipeline is a pure core wrapped by a thin I/O layer:

```
manifest → transform → template → emit-workspace / emit-plugin
                └──────── doctor/diff → sync (verify + force) / clean (remove)
```

| Module | Responsibility |
|--------|----------------|
| `src/manifest/` | Nori source model + parser (`nori.json`, YAML frontmatter, content discovery, subagent `SUBAGENT.md`+`nori.json`, Claude hooks block parsing) |
| `src/transform/` | the single Nori→Reasonix mapping table (tool names from Reasonix's `TOOL_CONTRACT.md`) + warnings for unmapped fields |
| `src/template/` | placeholder resolver (`$ARGUMENTS`, `$1..$9`, `{{name}}`/`{{name|default}}`) and explicit no-op agent-conditional (Nori has no inline conditional syntax) |
| `src/assets.ts` | colocated sidecar discovery (`references/`, `scripts/`, `templates/`, `examples/`) + copy planning |
| `src/dependencies.ts` | local-only dependency-skill resolution (vendorize/stub/warn) + stub rendering |
| `src/emit-workspace/` | pure planner + ownership-tracked writer for `.reasonix/…` |
| `src/emit-plugin/` | pure planner + writer for `reasonix-plugin.json` / `.claude-plugin/plugin.json` |
| `src/emit/ownership.ts` | shared ownership-tracked writer (sha256 manifest) |
| `src/doctor/` | source resolution, pure diff engine, read-only report runner |
| `src/sync/` | diff → action plan; executor with dry-run/yes/force + backups |
| `src/clean/` | ownership + diff → cleanup candidates; executor with dry-run/yes/force + backups |
| `src/cli/` | argument parsing + orchestration |

### Design invariants

- **One mapping table** — every Nori→Reasonix field/tool-name translation
  lives in `src/transform/table.ts`; no ad-hoc translations.
- **Never silently drop** — anything unmapped (tool names, hook fields,
  agent-specific extras) becomes a warning, never a silent loss.
- **Idempotent + ownership-tracked** — re-running is safe; user files are
  never overwritten without explicit `--force`.
- **No secrets** — `${VAR}` placeholders in MCP configs are preserved
  verbatim, never expanded into generated files.
- **Pure core, thin I/O** — mapping/planning is file- and CLI-free so it can
  be upstreamed as a `reasonix` agent target.

### Tool-name mapping

`Read→read_file`, `Write→write_file`, `Edit→edit_file`, `Grep→grep`,
`Glob→glob`, `Bash→bash`, `TodoWrite→todo_write`, `WebFetch→web_fetch`,
`WebSearch`/`Task`/`Skill` → reported as unmapped warnings.

**`web_search` is deliberately not remapped to `web_fetch`.** In Reasonix,
`web_search` is a provider-side server tool (opt-in `web_search = true` on
`[[providers]]`), not a builtin in the skill `allowed-tools` registry;
`web_fetch` is a builtin that fetches a known URL. They carry different
intent (discovery vs. consumption), so the converter reports the mismatch
instead of silently downgrading it. See the "Canonical sources" section of
`AGENTS.md` for the full reasoning.

---

## Canonical sources

- Nori: <https://github.com/tilework-tech/nori-skillsets>,
  <https://noriskillsets.dev/docs/building-a-skillset>
- Reasonix docs: `docs/PLUGIN_PACKAGES.md`, `docs/SPEC.md`, `docs/GUIDE.md`,
  `docs/TOOL_CONTRACT.md` in <https://github.com/esengine/DeepSeek-Reasonix>
- Reasonix builtin skill: `internal/skill/builtincontent/reasonix-guide/SKILL.md`

The mapping in `src/transform/table.ts` and the plugin-manifest shape are
derived from these sources, not from examples in the wild.

---

## Fidelity report — senior-infra-ops-analyst

The converter was validated against the real
[`senior-infra-ops-analyst`](https://github.com/marcoaureliocardoso/senior-infra-ops-analyst)
skillset (see `docs/fidelity-report.md` for the full snapshot):

| Component | Result |
|---|---|
| skills | 25 → 25 slugged `SKILL.md` (1:1) |
| subagents | 12 → 12 `runAs: subagent` profiles (1:1, with `max-iters`, `allowed-tools`, skill preload) |
| commands | 20 → 20 (`$ARGUMENTS`/`{{name|default}}` resolved) |
| hooks | 4 events → `.reasonix/settings.json` (`matcher`→`match` via `TOOL_NAME_MAP`, `{{skills_dir}}`→`.reasonix/skills`/`skills`, seconds→ms) |
| sidecars | `references/`/`scripts/`/`templates/` copied next to each skill; body paths rewritten |
| instructions | `AGENTS.md` → `REASONIX.md` |
| dependencies | local Nori store → vendorized copy or stub + warning (never downloads) |

Documented degradations (all warnings, none silent):

- Nori `ask` guard action → **fail-closed deny** in Reasonix (no hook-level `ask`; see `docs/hook-semantics.md`).
- `disallowedTools` → per-tool warnings (Reasonix has no negative allowlist).
- `WebSearch`/`Task`/`Skill` tools → unmapped warnings (`web_search` is a provider-side tool, never remapped to `web_fetch`).
- `model: inherit` → omitted (Reasonix subagent profiles inherit the executor model).

## Development

```bash
npm install                 # install dev deps
npm test                    # run the vitest suite (63 tests)
npm run build               # compile TypeScript to dist/
node bin/nori2reasonix --help
```

Tests use fixtures derived from real Nori structures
(`test/fixtures/skillset`, `single-skill`, `single-subagent`) and are written
test-first (TDD). Real-world validation was performed against the installed
`senior-swe` skillset.

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | success (convert, in-sync doctor, executed sync, help) |
| 1 | divergence (doctor) or I/O failure (convert) |
| 2 | usage error (missing/invalid flag) |
| 3 | Nori/Reasonix source unavailable |

## License

MIT
