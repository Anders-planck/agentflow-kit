---
name: verification-gate
description: Verify implementation claims with relevant tests, validation, diffs, and concrete evidence before completion. Use when finishing code, configuration, documentation, releases, migrations, or any task whose result must be proven rather than assumed.
---

# Verification Gate

## Workflow

1. Restate the requested outcome as observable conditions.
2. Inspect the final diff and exclude unrelated changes.
3. Run the narrowest relevant tests, then repository-wide validation when risk warrants it.
4. Check generated artifacts in their consumed format, not only their source.
5. Report exact commands, pass/fail state, and any unverified boundary.

## Guardrails

- Do not treat compilation alone as behavioral verification.
- Do not hide skipped, flaky, unavailable, or partially passing checks.
- Do not declare completion while a relevant failure remains.
- Avoid destructive cleanup merely to obtain a clean test result.
