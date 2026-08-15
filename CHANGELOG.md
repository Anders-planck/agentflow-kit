# Changelog

All notable changes follow Keep a Changelog. Versions follow Semantic Versioning.

## [Unreleased]

## [0.2.5] - 2026-08-15

### Fixed

- Release-tag validation now exercises artifact transport and response-policy branches, keeping branch coverage safely above the required 80% threshold across CI environments.

## [0.2.4] - 2026-08-15

### Added

- Dependency commands can declare non-secret runtime environment requirements, which are applied without replacing the parent process environment and rendered explicitly in human previews.
- Checksummed release-asset installation verifies HTTPS, SHA-256, archive paths and entry types before publishing a single executable atomically.

### Changed

- Trivy is updated to 0.74.0 at immutable commit `e1fd17a0ea4a8cf24bc4b4dd7e2cfbf4bb31b994` and now prefers its official Homebrew package on macOS and Linux.
- The Trivy Go fallback enables the upstream-required `GOEXPERIMENT=jsonv2` build environment.
- SCIP 0.9.0 installs from official per-platform release assets and recorded SHA-256 digests instead of the unsupported `go install package@version` path.

### Fixed

- Full installs no longer fail while compiling Trivy because `encoding/json/v2` was excluded by Go build constraints.
- Full installs no longer fail on SCIP because its pinned module contains a local `replace` directive that Go rejects for versioned package installation.

## [0.2.3] - 2026-08-14

### Fixed

- Full installs on macOS now prefer the official Homebrew package for Zizmor instead of compiling it with an otherwise incompatible local Rust toolchain.
- Dependency installers can declare minimum toolchain versions, so incompatible source builds are rejected during preflight before any dependency mutation begins.
- Terminal, JSON, and doctor output now report the concrete missing or incompatible prerequisite when no safe installer is available.

## [0.2.2] - 2026-08-13

### Fixed

- Interactive `full` installs now explain where to obtain the Snyk API token and request it through a hidden prompt instead of failing immediately.
- Prompted credentials exist only in the current Orditra process and are never written to configuration, reports, logs, or the repository.
- Non-interactive installs now provide secure runtime setup commands and the official Snyk account URL.
- Human progress failures are no longer printed a second time by the global CLI error handler.

## [0.2.1] - 2026-08-13

### Changed

- The `full` preset now activates all 26 registered capabilities, including project-scoped, authenticated, high-risk, security, visual, symbol-graph, and hook providers.
- Full installs inventory all 20 executable dependencies required by that catalog, with pinned package versions or immutable source commits where the upstream installer supports them.
- Probe, Chrome DevTools, and GitHub MCP are rendered through Codex, Claude Code, and OpenCode adapters when `full` is selected.
- `orditra --preset full doctor` now diagnoses the requested preset, including generic MCP client integration, instead of silently falling back to the configured default.
- Install, update, diff, rollback, uninstall, and garbage-collection flows now use staged human output and item-level progress bars while preserving clean JSON output for automation.

## [0.2.0] - 2026-08-13

### Added

- Schema-v2 capability, provider, profile, reporter, compatibility, and security-policy registries.
- Capability modes for registered, project-scoped, automatic, always-on, and disabled tooling.
- Context7 integration and optional profiles for repository maps, browser QA, performance, architecture, security, local knowledge, evals, hardened MCP, telemetry, visual exports, container security, code-property graphs, and multi-repository symbols.
- Structured terminal, JSON, Markdown, SARIF, and self-contained HTML reporting.
- Configuration and skill provenance explanations, atomic schema-v1 migration, project diff/sync, and token-budgeted repository maps.
- Transaction recovery journals, safer rollback, and conservative garbage collection.
- Interactive required-dependency inventory and installation with pinned, platform-aware commands and separate consent.
- External skill content digests, license digests, review metadata, and optional agent-file scanning.
- Codex plugin and repo-marketplace packaging.
- Promptfoo routing evals, expanded unit/integration coverage, CodeQL, OSV, zizmor, Scorecard, and SPDX SBOM generation.

### Changed

- Planner logic is split into capability resolution, provider planners, and client configuration helpers.
- Presets now select capabilities instead of legacy boolean components.
- Provider and GitHub Action provenance is immutable and machine-validated.
- The CLI uses Commander while preserving `orditra version`, `orditra v`, `--version`, and `-V`.
- The CLI entrypoint is reduced to bootstrap code, with command families and shared presentation/options extracted into focused modules.
- The enforced line and function coverage floors are raised to 80%, backed by public CLI integration tests.

### Fixed

- Project detection ignores Orditra-generated agent/config directories, so repeated `project sync` runs are idempotent.
- External skill digests use deterministic case-folded ordering and portable `/` paths, matching the reviewed lock across platforms while continuing to fail closed on content changes.
- Snyk Agent Scan is classified as authenticated/high-risk, remains explicit opt-in, requires `SNYK_TOKEN` when activated, and no longer blocks default `recommended` or `full` installs.

## [0.1.2] - 2026-08-11

### Added

- Trusted npm publishing and verified public release artifacts.

## [0.1.1] - 2026-08-11

### Changed

- Normalized npm repository metadata and release verification.

## [0.1.0] - 2026-08-10

### Added

- Initial reversible multi-client configuration, shared skills, presets, validation, rollback, and release automation.
