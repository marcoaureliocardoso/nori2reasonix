# nori2reasonix

Converter that translates any Nori Skillset package/skill into Reasonix-native workspace layouts and Reasonix plugin packages.

## Project

- Node.js + TypeScript CLI, zero runtime dependencies, Node ≥ 22.
- Entry point: `bin/nori2reasonix` (scaffolded placeholder — CLI implementation pending).
- Two output targets: `--target workspace` (`.reasonix/…` tree) and `--target plugin` (`reasonix-plugin.json` / `.claude-plugin/plugin.json`).
- Source formats: Nori skillset dir (`nori.json` + content dirs), single skill/subagent package, or a Nori-installed `.claude` tree.

## Commands

- `npm install` — install dev deps (typescript, vitest) ✅ verified
- `npm test` — run the vitest suite ✅ verified
- `npm run build` — compile TypeScript to `dist/` ✅ verified
- `node bin/nori2reasonix --help` — CLI help ⏳ scaffold placeholder exists; real CLI not yet implemented
- `node bin/nori2reasonix --input <path> --output <path> --target workspace|plugin|both` ⏳ not yet implemented
- `reasonix doctor capabilities --json` — integration check that emitted skills/commands/hooks/mcp are discovered with zero errors ⏳ requires an emitted workspace to check

## Architecture

- `manifest` — Nori source model and parser (`nori.json`, content discovery).
- `template` — Nori agent-conditional + placeholder engine targeting `reasonix`.
- `transform` — skill/command/subagent frontmatter mapping to Reasonix.
- `emit-workspace` — writes `.reasonix/skills`, `.reasonix/commands`, `REASONIX.md`, `.reasonix/settings.json` hooks, `.mcp.json`.
- `emit-plugin` — writes `reasonix-plugin.json` or `.claude-plugin/plugin.json` package.
- `cli` — argument parsing and orchestration; thin wrapper over the pure mapping core.

## Conventions

- Keep the mapping core pure and free of CLI/file-IO concerns so it can be upstreamed into `nori-skillsets` as a `reasonix` agent target.
- Centralize every Nori→Reasonix field/tool-name mapping in one table; do not scatter ad-hoc translations.
- Hooks are best-effort: translate what maps, emit warnings for the rest, never silently drop.
- Emits are idempotent and ownership-tracked (`.nori2reasonix.json`); never overwrite user files.
- Never write secrets into generated files.

## Canonical sources (consult before mapping to Reasonix)

Target-format ground truth lives in the Reasonix repo/docs, not in this repo's
summary. Consult these before changing `transform`/`emit-*`:

- Reasonix docs (install-version-matched): https://github.com/esengine/DeepSeek-Reasonix — `docs/PLUGIN_PACKAGES.md` (native `reasonix-plugin.json` v2 `apiVersion`/`contributes` schema, Codex/Claude manifest compatibility), `docs/SPEC.md` §5 (config contract), `docs/GUIDE.md` (skills/commands/hooks/MCP).
- Builtin `reasonix-guide` skill: `internal/skill/builtincontent/reasonix-guide/SKILL.md` (discovery dirs, priorities, hook events, error codes).
- Nori source of truth: https://github.com/tilework-tech/nori-skillsets and https://noriskillsets.dev/docs/building-a-skillset; real installed skillsets live in `~/.nori/profiles/`.

Key verified facts (2026-08-25): skills discover at `<workspace>/{.reasonix,.agents,.agent,.claude}/skills/` as `<name>/SKILL.md` or flat `<name>.md`; commands are `<name>.md` under `commands/` with `git/commit.md` → `/git:commit`; hooks are 11 events, project scope via `.reasonix/settings.json` (auto-loaded), `match` is an anchored regex, `timeout` in ms; MCP order is `reasonix.toml [[plugins]]` → `.mcp.json` → plugin packages; instructions load `REASONIX.md`/`AGENTS.md`/`CLAUDE.md`/`*.local.md`.

## Notes

- Scaffold created (2026-08-25): `package.json`, `tsconfig.json`, `bin/nori2reasonix` placeholder, `vitest.config.ts`, `test/`. `npm install` (0 vulnerabilities), `npm test`, `npm run build` all verified. The `--help`/`--input`/`--output`/`--target` flags and the six modules (`manifest`…`cli`) remain to be implemented.
