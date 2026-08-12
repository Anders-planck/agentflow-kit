---
name: dependency-architecture
description: Map module dependencies and enforce architectural boundaries with dependency-cruiser or a language-specific provider. Use when reviewing coupling, detecting cycles, designing layers, validating import rules, or explaining how modules depend on one another.
---

# Dependency Architecture

## Workflow

1. Identify the language, module system, generated paths, aliases, and intended boundaries.
2. Use dependency-cruiser for JavaScript and TypeScript; select a profile-specific provider for other languages.
3. Generate a graph before proposing rules.
4. Distinguish existing violations from newly introduced ones.
5. Add the smallest enforceable rule and a regression test.
6. Report cycles, forbidden edges, orphan modules, and high fan-in/fan-out nodes.

## Guardrails

- Do not infer semantic symbol references from an import graph alone.
- Do not ban dependencies without documenting the intended boundary.
- Exclude generated and vendored code.
- Prefer incremental ratchets when a legacy repository has many violations.
