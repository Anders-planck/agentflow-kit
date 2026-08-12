# Workflow model

Orditra routes work by evidence need, not by enabling every tool. A normal engineering task follows this progression:

1. **Orient** — inspect repository guidance and project markers.
2. **Classify** — choose the smallest skill flow and capability set.
3. **Protect context** — route large logs, JSON, API responses, and repository scans through context-mode.
4. **Discover** — use text search first, structural search for syntax, Serena for relationships, and a repository map only for broad orientation.
5. **Ground current dependencies** — use official documentation or Context7 when behavior may have changed.
6. **Inventory dependencies** — show missing active requirements and obtain separate installation consent.
7. **Plan** — preview client and project mutations without side effects.
8. **Implement** — make the narrowest coherent change while preserving local conventions.
9. **Verify** — run targeted tests, then broader checks proportional to risk.
10. **Secure** — inspect agent files, dependencies, actions, and provider permissions when the change touches supply-chain surfaces.
11. **Report** — emit structured findings and reproducible evidence.
12. **Recover** — use the transaction journal and backups if application is interrupted.
13. **Promote** — publish only after validation, evals, SBOM generation, checksums, and provenance succeed.

## Skill routing

| Need | Primary skill/provider |
| --- | --- |
| choose a workflow | `workflow-router` |
| initialize project conventions | `project-bootstrap` |
| symbol definitions/references | `serena-symbolic-code` / Serena |
| syntax patterns or codemods | `structural-code-search` / ast-grep |
| current library behavior | `current-docs` / Context7 |
| bounded repository orientation | `large-codebase-map` / native map or Repomix |
| browser behavior | `browser-qa` / Playwright CLI |
| performance evidence | `performance-report` / Chrome DevTools MCP |
| dependency boundaries | `dependency-architecture` / dependency-cruiser |
| agent-file security | `agent-supply-chain` / Agent Scan and zizmor |
| completion evidence | `verification-gate` |
| portable findings | `evidence-report` |

External Matt Pocock skills are copied only after commit, license, and content digests match the lock registry. They complement the router; they do not override repository instructions or Orditra’s verification and security gates.

## Project sync

`orditra project diff` shows detected signals, profiles, skills, and conflicts. `orditra project sync` writes `.orditra/project.yaml` and copies missing skills into `.agents/skills`. A different existing skill is reported and preserved, so shared project conventions are never overwritten silently.

## Completion contract

A task is complete only when the claimed outcome is supported by current evidence. Reports should include command or check name, status, scope, duration when known, and remediation for warnings/errors. Machine-readable formats use stable finding IDs and severities so CI can consume the same evidence shown to a human.
