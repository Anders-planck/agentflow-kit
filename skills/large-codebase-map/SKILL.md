---
name: large-codebase-map
description: Build token-budgeted repository maps and route large-code discovery between Serena, Repomix, and Probe. Use when a repository is unfamiliar, too large for direct reading, spans many modules, or requires a symbol and dependency overview before implementation.
---

# Large Codebase Map

## Workflow

1. Set an explicit map token budget before collecting code.
2. Use Serena for definitions, references, and semantic relationships.
3. Use Repomix compression and token counts for a repository-wide signature map.
4. Use Probe only for high-scale AST/BM25 discovery or when the semantic backend is unavailable.
5. Rank modules by references, dependencies, task terms, and changed files.
6. Expand only the selected definitions needed for the next decision.

## Guardrails

- Do not enable Serena and Probe for the same role without explaining the fallback.
- Do not pack the entire repository when a bounded map answers the question.
- Respect ignore rules and exclude secrets, generated code, and vendored trees.
- Treat token counts as estimates unless the target model tokenizer is used.
