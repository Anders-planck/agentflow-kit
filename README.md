# Orditra

Orditra is a public, reversible configuration toolkit for Codex, Claude
Code, and OpenCode. It combines workflow-aware Agent Skills with context-mode,
Serena, and ast-grep without copying entire client home directories or storing
credentials.

The name **Orditra** is coined from the Italian *ordito* (the warp that holds a
fabric together) and orchestration: one durable configuration fabric across
different coding agents.

> Status: `0.1.0` public pre-release. GitHub artifacts include a SHA-256
> checksum and build attestation; npm publication is prepared separately.

## What it manages

- A shared Agent Skills tree for Codex/OpenCode and Claude-compatible links.
- Workflow routing from project setup through planning, implementation,
  diagnosis, verification, and handoff.
- context-mode through each client's official plugin mechanism.
- Serena through official Codex/Claude MCP commands and OpenCode JSONC config.
- Client-specific guidance through bounded managed blocks.
- Backups, idempotent updates, doctor output, and rollback.

Orditra never owns client authentication files, session history, Serena
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
npx --yes github:Anders-planck/orditra install --preset recommended
npx --yes github:Anders-planck/orditra doctor
```

After the first public npm release, the consumer path will be:

```bash
npx orditra@latest install --preset recommended
npx orditra@latest doctor
```

## Presets

| Preset | Includes |
|---|---|
| `minimal` | Shared policy and Orditra-authored portable skills |
| `recommended` | Minimal + context-mode + Serena + ast-grep checks + curated Matt Pocock flow |
| `full` | Recommended + all stable public Matt Pocock workflow skills |

Authenticated service MCPs are never enabled by `full`; they remain explicit
opt-ins.

## Commands

```text
orditra install       Preview, confirm, back up, and apply a preset
orditra diff          Show the install plan without writing
orditra init          Create user-level Orditra preferences
orditra doctor        Check clients, integrations, binaries, and skill drift
orditra update        Reconcile the current release and preset
orditra rollback      Restore the latest pre-install snapshot
orditra uninstall     Preview removal; add --yes to unwind all changesets
orditra project init  Add a non-destructive project marker
orditra validate      Validate registries, skills, and public safety
```

All mutating workflows support `--dry-run`; automation can use `--yes --json`.
Use `--home <temporary-directory>` to test without touching the real home.
Conflicting skill directories are preserved by default. Use `--adopt-existing`
to back them up and replace them with links to the managed release. `uninstall`
unwinds the complete changeset history, including updates and adoptions.

## One-file configuration

Run `orditra init`, then manage every client from
`~/.config/orditra/config.yaml`:

```yaml
schemaVersion: 1
preset: recommended
clients: auto # or [codex, claude, opencode]
components:
  serena: true
  astGrep: true
```

`orditra update --yes` reconciles Codex, Claude Code, and OpenCode from that
single source of truth. The command line `--preset` wins over the file. Optional
machine-only overrides belong in `config.local.yaml`; keep the main file in a
dotfiles repository or symlink it from one. Orditra validates both layers and
never reads credentials from them.

This repository ships a safe public default at `config/config.yaml`. Clone
owners can make it their live, versioned configuration with:

```bash
mkdir -p ~/.config/orditra
mv ~/.config/orditra/config.yaml ~/.config/orditra/config.backup.yaml
ln -s "$PWD/config/config.yaml" ~/.config/orditra/config.yaml
```

### Upgrade from the provisional name

Early `0.1.0` checkouts used the provisional name `agentflow-kit`. Orditra reads
that configuration and manifest history automatically, then makes its own XDG
paths canonical on the first successful update. Existing backups remain part
of the uninstall chain.

## Workflow integration

Skills are not a detached command catalog. `registry/workflows.yaml` maps the
engineering lifecycle to Orditra and pinned upstream skills. Only metadata is
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

Orditra-authored code and skills use the MIT License. Matt Pocock's skills
are fetched from a pinned commit under their MIT License; Orditra preserves
the upstream license and does not install both plugin and copied forms.
context-mode, Serena, and ast-grep remain separate upstream integrations.
