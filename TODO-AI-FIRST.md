# TODO — nori2reasonix

> Fonte normativa local para evolução do projeto. Persiste o estado entre sessões.

Última consolidação: 2026-08-25

## Status permitidos

- `CONCLUÍDO`: implementado, revisado, validado e integrado.
- `EM ANDAMENTO`: existe execução ativa nesta sessão de trabalho.
- `PENDENTE`: necessário, mas ainda não iniciado.
- `BLOQUEADO`: depende de decisão ou capacidade externa.
- `DEPRECIADO`: deixou de ser necessário; nunca apagar silenciosamente.

## Contexto da sessão (o que já foi decidido)

- Projeto renomeado de `nori4reasonix` para `/mnt/c/projects/nori2reasonix`.
- `AGENTS.md` criado por `/init` com comandos ainda NÃO verificados (scaffold não existe).
- Plugin Superpowers instalado no Reasonix: scope global, commit `b36e082`, versão `6.3.0`, 14 skills, 2 hooks SessionStart.
- Não há slash commands para adicionar: o pacote v6.3.0 não contém `commands/`.

## Superpowers — status para full effect

- `CONCLUÍDO` — instalação do plugin (14 skills + 2 hooks) verificada via `reasonix plugin doctor superpowers`.
- `EM ANDAMENTO` — ativar em sessão nova: o hook SessionStart só carrega contexto de skills em nova sessão.
  - Para ter full effect: abrir nova sessão no workspace `/mnt/c/projects/nori2reasonix` e confirmar que a skill `using-superpowers` e as 14 skills aparecem em `/skills` e que o hook SessionStart disparou.
  - Verificação pós-nova-sessão: `reasonix plugin show superpowers` (enabled: true, skills: 14) e `/skills` listando `/superpowers:*`.

## Itens do projeto

- `CONCLUÍDO` — Scaffold do converter (`package.json`, `tsconfig.json`, `bin/nori2reasonix`, vitest), conforme plano aprovado.
- `CONCLUÍDO` — Verificar a seção `## Commands` do `AGENTS.md` contra o scaffold real após criá-lo.
- `CONCLUÍDO` — Implementação dos módulos do conversor. `manifest`, `transform`, `emit-workspace`, `emit-plugin`, `cli` e `template` **concluídos** (TDD, 47 testes, validados contra `~/.nori/profiles/public/senior-swe` real; I/O **síncrono** decidido em conjunto). `bin/nori2reasonix --help` e `--input/--output/--target` funcionais. `template`: placeholder resolver (`$ARGUMENTS`/`$1..$N`) + agent-conditional como no-op explícito (a fonte Nori não documenta sintaxe inline; extras por agente ficam em `agents/<name>.yaml` e geram warning). Fontes canônicas do Reasonix registradas no `AGENTS.md` (docs `PLUGIN_PACKAGES.md`/`SPEC.md`/`GUIDE.md`/`TOOL_CONTRACT.md` + skill `reasonix-guide`).
- `CONCLUÍDO` — `git init` + primeiro commit (`2b55a0b`, branch `main`, 46 arquivos).
- `CONCLUÍDO` — Validação `reasonix doctor capabilities --json` sobre workspace emitido: raiz `.reasonix/skills` com `status: ok`, skills descobertas (summary skills=70, commands=21, errors=0), `REASONIX.md` carregado como instrução (order 2). 1 warning remanescente é de skill count do plugin Superpowers instalado, não da emissão.

## Notas da sessão

- Nada a persistir sobre credenciais ou segredos.
