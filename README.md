# Agentflow Kit

Agentflow Kit is a public, reversible configuration toolkit for Codex, Claude
Code, and OpenCode. It combines workflow-aware Agent Skills with context-mode,
Serena, and ast-grep without copying entire client home directories or storing
credentials.

> Status: `0.1.0` development preview. The public GitHub repository is live;
> the npm package is not published yet.

## What it manages

- A shared Agent Skills tree for Codex/OpenCode and Claude-compatible links.
- Workflow routing from project setup through planning, implementation,
  diagnosis, verification, and handoff.
- context-mode through each client's official plugin mechanism.
- Serena through official Codex/Claude MCP commands and OpenCode JSONC config.
- Client-specific guidance through bounded managed blocks.
- Backups, idempotent updates, doctor output, and rollback.

Agentflow never owns client authentication files, session history, Serena
memories, or context-mode indexes.

## Build from source

Requirements: Node.js 22.5+, Git, and at least one supported client.

```bash
npm install
npm test
node dist/src/cli.js diff --preset recommended
node dist/src/cli.js install --preset recommended --yes
node dist/src/cli.js doctor
```

Or run the public GitHub package directly:

```bash
npx --yes github:Anders-planck/agentflow-kit install --preset recommended
npx --yes github:Anders-planck/agentflow-kit doctor
```

After the first public npm release, the consumer path will be:

```bash
npx agentflow-kit@latest install --preset recommended
npx agentflow-kit@latest doctor
```

## Presets

| Preset | Includes |
|---|---|
| `minimal` | Shared policy and Agentflow-authored portable skills |
| `recommended` | Minimal + context-mode + Serena + ast-grep checks + curated Matt Pocock flow |
| `full` | Recommended + all stable public Matt Pocock workflow skills |

Authenticated service MCPs are never enabled by `full`; they remain explicit
opt-ins.

## Commands

```text
agentflow install       Preview, confirm, back up, and apply a preset
agentflow diff          Show the install plan without writing
agentflow init          Create user-level Agentflow preferences
agentflow doctor        Check clients, integrations, binaries, and skill drift
agentflow update        Reconcile the current release and preset
agentflow rollback      Restore the latest pre-install snapshot
agentflow uninstall     Preview removal; add --yes to restore the snapshot
agentflow project init  Add a non-destructive project marker
agentflow validate      Validate registries, skills, and public safety
```

All mutating workflows support `--dry-run`; automation can use `--yes --json`.
Use `--home <temporary-directory>` to test without touching the real home.

## One-file configuration

Run `agentflow init`, then manage every client from
`~/.config/agentflow-kit/config.yaml`:

```yaml
schemaVersion: 1
preset: recommended
clients: auto # or [codex, claude, opencode]
components:
  serena: true
  astGrep: true
```

`agentflow update --yes` reconciles Codex, Claude Code, and OpenCode from that
single source of truth. The command line `--preset` wins over the file. Optional
machine-only overrides belong in `config.local.yaml`; keep the main file in a
dotfiles repository or symlink it from one. Agentflow validates both layers and
never reads credentials from them.

## Workflow integration

Skills are not a detached command catalog. `registry/workflows.yaml` maps the
engineering lifecycle to Agentflow and pinned upstream skills. Only metadata is
available before routing; full skill instructions and references load on
demand.

- context-mode protects large output and session continuity.
- Serena handles semantic symbols and references.
- ast-grep handles syntactic patterns and controlled rewrites.
- `rg` remains the correct tool for text, filenames, logs, and config strings.

See [workflow design](docs/workflows.md) and [architecture](docs/architecture.md).

## Public-repository safety

Run this before every release:

```bash
npm run check
```

The validator rejects personal macOS home paths, unsafe external-skill paths,
invalid skill metadata, unknown workflow routes, and common secret patterns.
GitHub CI adds a dedicated secret scan. Review the
[release checklist](docs/public-release-checklist.md) before creating the
remote or publishing npm.

## License and upstream work

Agentflow-authored code and skills use the MIT License. Matt Pocock's skills
are fetched from a pinned commit under their MIT License; Agentflow preserves
the upstream license and does not install both plugin and copied forms.
context-mode, Serena, and ast-grep remain separate upstream integrations.
