---
name: current-docs
description: Retrieve current version-specific library and API documentation from Context7 or primary official sources. Use when implementation depends on software APIs, configuration, versions, deprecations, compatibility, or behavior that may have changed.
---

# Current Docs

## Workflow

1. Identify the exact library, product, and installed or requested version.
2. Prefer Context7 for dependency documentation and the vendor's primary documentation for product behavior.
3. Retrieve only the sections needed for the task.
4. Verify examples against local types, manifests, tests, or schemas.
5. Cite the primary page and distinguish sourced facts from inference.

## Guardrails

- Do not rely on remembered current syntax when documentation can change.
- Do not use secondary tutorials for authoritative configuration.
- Do not fetch broad documentation dumps into model context.
- Never expose API keys in generated MCP configuration.
