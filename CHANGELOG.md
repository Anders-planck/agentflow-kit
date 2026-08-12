# Changelog

All notable changes are documented here. This project follows Semantic
Versioning.

## 0.1.2 - 2026-08-12

- Upgrade Orditra-managed skill symlinks when installing a newer release.
- Preserve symlinks outside the Orditra release namespace unless adoption is
  explicitly requested.
- Add an integration regression test for cross-version skill upgrades.

## 0.1.1 - 2026-08-12

- Publish the package from the tagged commit through npm trusted publishing.
- Normalize npm repository metadata and document the live registry install path.
- Complete checksum, attestation, clean-install, and public pre-release checks.

## 0.1.0 - 2026-08-12

- Adopt the original public name Orditra, with automatic migration from the
  provisional pre-release name.
- Initial public-safe repository structure.
- Transactional CLI for install, diff, doctor, rollback, uninstall, and project init.
- Codex, Claude Code, and OpenCode adapters.
- Workflow registry with progressive-disclosure skills.
- context-mode, Serena, ast-grep, and Matt Pocock skills integration.
