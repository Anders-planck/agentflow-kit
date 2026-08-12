---
name: structural-code-search
description: Uses ast-grep for AST-aware code search, lint rules, and controlled rewrites while keeping text search and semantic navigation separate. Use for syntactic patterns, codemods, repeated code shapes, or structural rules that regex cannot safely express.
license: MIT
compatibility: Requires sg or ast-grep; project scans require sgconfig.yml.
metadata:
  author: orditra
  version: "0.1.0"
---

# Structural Code Search

## Workflow

1. Confirm the target language and the smallest relevant path.
2. Start with a simple pattern and metavariables.
3. Test the pattern against a small representative sample.
4. Move complex constraints into a YAML rule.
5. Inspect the project config with `sg scan --inspect summary`.
6. Preview rewrites interactively or as a diff before applying broadly.
7. Run formatter, type checks, and relevant tests afterward.

See [patterns and safety](references/patterns.md) for examples.

## Guardrails

- Use `rg` for text, filenames, logs, and non-code configuration.
- Use Serena when symbol identity or references matter.
- Never assume formatting-insensitive matching means semantic equivalence.
- Do not run a repository-wide rewrite before validating positive and negative cases.
- Keep project-specific rules in the project, not in a global catch-all config.

