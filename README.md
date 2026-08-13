# Orditra

Orditra is a public, versionable capability fabric for Codex, Claude Code, and OpenCode. It keeps one source of truth for agent policies, skills, MCP providers, CLI tools, project profiles, security rules, and evidence reports, then renders only the configuration each client needs.

Its defaults are deliberately small: capabilities are available without forcing every MCP server into every session. Configuration is reversible, external skill sources are commit- and digest-pinned, and project-specific tooling stays with the project.

## What it manages

- shared policies and compact workflow-routing skills;
- context-mode for large-output protection;
- Serena for symbol navigation and controlled semantic edits;
- ast-grep for syntax-aware search and rewrites;
- Context7 for current version-specific documentation;
- Matt Pocock's workflow skills, pinned and verified before installation;
- optional repository maps, browser QA, performance, architecture, security, local knowledge, evaluation, observability, and visual-report providers;
- terminal, JSON, Markdown, SARIF, and self-contained HTML reports.

Orditra distinguishes four lifecycle decisions:

| Mode | Meaning |
| --- | --- |
| `off` | unavailable and not configured |
| `registered` | known to Orditra and discoverable, but not activated |
| `project` | kept out of global configuration and exposed through project workflows |
| `auto` / `always` | activated by the selected preset, profile, or explicit override |

## Install

Requires Node.js 22 or later. Start with a dry run:

```bash
npm install --global orditra
orditra install --preset recommended --dry-run
orditra install --preset recommended --yes
orditra doctor
```

At installation time Orditra inventories the executables required by the active preset. Missing dependencies are shown with their pinned version/source and proposed package-manager command, then require a separate confirmation before configuration is applied. `--dry-run` only previews them; `--yes` approves safe required dependency installers; `--skip-dependencies` leaves them untouched and reports the resulting missing capability. Package-manager changes are external to Orditra and are not removed by `orditra rollback` or `uninstall`. Optional, project-only, authenticated, and high-risk providers are never mass-installed by the global installer.

Snyk Agent Scan is registered but disabled by default because it is authenticated and requires `SNYK_TOKEN`. To opt in, configure `agent-supply-chain.mode: auto`, install the pinned `snyk-agent-scan` provider, and supply the token through the environment rather than a versioned configuration file. Immutable commit, license, and content-digest verification remains active for external skills even when Agent Scan is not enabled.

To test the Codex plugin directly from GitHub:

```bash
codex plugin marketplace add Anders-planck/orditra --ref main
codex
/plugins
```

Install or enable Orditra in the plugin browser, then start a new Codex session. The repository also works as a local marketplace and as a standalone `.codex-plugin` bundle.

To work from source:

```bash
git clone https://github.com/Anders-planck/orditra.git
cd orditra
npm ci
npm run check
npm link
```

## Presets

| Preset | Intended use |
| --- | --- |
| `minimal` | local-only policy and workflow layer; networked providers remain registered or off |
| `recommended` | context protection, semantic and structural code work, current docs, evidence, and supply-chain checks |
| `full` | all broadly useful profiles registered, while authenticated and high-risk providers remain opt-in |

Preview any change before applying it:

```bash
orditra diff --preset recommended
orditra install --preset recommended --dry-run
```

## Configuration

The portable user configuration lives at `~/.config/orditra/config.yaml` on macOS/Linux or the corresponding XDG directory. Set `ORDITRA_CONFIG_HOME`, `XDG_CONFIG_HOME`, `XDG_STATE_HOME`, or `ORDITRA_PORTABLE_HOME` to relocate it without editing committed files.

```yaml
schemaVersion: 2
preset: recommended
clients: [codex, claude, opencode]
profiles:
  - web
capabilities:
  repository-map:
    mode: registered
  browser-qa:
    mode: project
  github-integration:
    mode: off
```

Configuration precedence is deterministic:

1. capability registry defaults;
2. selected preset;
3. profiles, in listed order;
4. user capability overrides;
5. legacy component flags during schema-v1 compatibility.

Inspect the result and its provenance:

```bash
orditra config explain
orditra config explain --format json
orditra skills explain workflow-router
orditra config migrate --dry-run
orditra config migrate --yes
```

## Project-aware setup

`project sync` detects repository signals, writes a portable marker, and copies only relevant skills into `.agents/skills`. Existing divergent project skills are preserved.

```bash
orditra project diff --dir /path/to/project
orditra project sync --dir /path/to/project --dry-run
orditra project sync --dir /path/to/project --yes
```

Detected profiles include web development, web performance, large codebases, JavaScript architecture, GitHub Actions, security, evaluations, local knowledge, hardened MCP execution, container security, code-property graphs, multi-repository symbols, telemetry, and visual export.

## Commands

```text
orditra install|update|diff
orditra doctor|report|map
orditra project init|diff|sync
orditra config explain|migrate
orditra skills explain <name>
orditra rollback|uninstall|gc
orditra validate|version
```

All diagnostic commands support `--format terminal|json|markdown|sarif|html` and `--output <file>`. `orditra map` also accepts `--budget <tokens>` and reports what was selected instead of silently overflowing the context window.

## Safety and reproducibility

- Managed blocks preserve unrelated client configuration.
- Every mutation is planned first and recorded in a transaction journal.
- Interrupted runs are recoverable; rollback failures remain visible instead of being hidden.
- External skills require an immutable commit, license digest, review date, and per-file content digests.
- Provider metadata declares network, authentication, write, hook, and risk properties.
- GitHub Actions are pinned to full commit SHAs; releases include checksums, provenance attestations, and an SPDX SBOM.
- Reports redact common secret-bearing arguments and HTML output has no remote assets.

Do not commit API keys, OAuth tokens, private MCP URLs, Serena memories, or machine-specific paths. Authenticated providers such as GitHub are registered but disabled until the user configures them deliberately.

## Development

```bash
npm ci
npm test
npm run coverage
npm run validate
npm run eval
npm run check
npm pack --dry-run
```

Architecture and extension rules are documented in [docs/architecture.md](docs/architecture.md), [docs/workflows.md](docs/workflows.md), and [CONTRIBUTING.md](CONTRIBUTING.md). The ecosystem decisions and optional integrations are recorded in [docs/ecosystem-audit.md](docs/ecosystem-audit.md).

## License

MIT. Third-party provenance is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
