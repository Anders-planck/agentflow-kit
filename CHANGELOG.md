# Changelog

All notable changes follow Keep a Changelog. Versions follow Semantic Versioning.

## [Unreleased]

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
