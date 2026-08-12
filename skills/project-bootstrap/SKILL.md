---
name: project-bootstrap
description: Initializes a repository for portable agent workflows without overwriting existing conventions. Use for new projects, when Orditra project markers are missing, or before skills that require issue-tracker, triage-label, CONTEXT.md, or ADR configuration.
license: MIT
metadata:
  author: orditra
  version: "0.2.0"
---

# Project Bootstrap

Requires the `orditra` CLI for deterministic file generation.

## Workflow

1. Inspect existing `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, docs, and issue configuration.
2. Infer safe values from current files; ask only for choices that change behavior.
3. Preview with `orditra project init --dry-run --dir <project>`.
4. Apply only after the preview matches the intended scope.
5. Validate generated YAML and show the resulting diff.

## Choices

- Issue tracker: GitHub, Linear, or local Markdown.
- Triage labels and workflow states.
- Domain documentation location (`CONTEXT.md` and ADR directory).
- Serena onboarding/memory policy.
- Whether the project needs `sgconfig.yml`.

## Guardrails

- Preserve existing guidance and nested rules.
- Never commit local credentials or Serena memories.
- Keep project config team-portable; put personal paths in ignored local files.
- Run `setup-matt-pocock-skills` after bootstrap when installed.
