---
name: browser-qa
description: Run token-efficient browser quality assurance with Playwright CLI and escalate to MCP only for persistent exploratory loops. Use when verifying web flows, forms, navigation, responsive behavior, accessibility, screenshots, or browser regressions.
---

# Browser QA

## Workflow

1. Reuse the project's existing Playwright configuration and tests when present.
2. Prefer concise Playwright CLI commands for deterministic coding-agent checks.
3. Capture the smallest evidence that proves each flow: assertion, trace, screenshot, or console error.
4. Use Playwright MCP only when persistent page state and iterative exploration materially help.
5. Report the tested URL, viewport, steps, expected result, and observed result.

## Guardrails

- Do not load large accessibility trees when a targeted CLI assertion is enough.
- Do not use a signed-in personal browser profile without explicit scope.
- Do not modify production data during QA.
- Keep screenshots and traces out of version control unless requested.
