# Workflow model

`registry/workflows.yaml` is the portable routing source. It records stages,
skills, aliases, prerequisites, and provenance without placing proprietary
fields into Agent Skills frontmatter.

## Lifecycle

1. Setup detects whether tracker, labels, and domain-document locations exist.
2. Discovery resolves uncertainty through routing, grilling, or a prototype.
3. Planning produces a spec and independently grabbable tickets when requested.
4. Implementation selects TDD, Serena, and ast-grep only when appropriate.
5. Diagnosis follows reproduce, minimize, hypothesize, instrument, fix, verify.
6. Architecture work focuses on deeper modules and clear boundaries.
7. Verification reviews behavior and standards.
8. Handoff preserves decisions and next actions.

Explicit user-selected skills always win. A short task may skip every stage but
one. “Integrated” does not mean executing the entire lifecycle automatically.

## Upstream aliases

The current Matt Pocock source uses `to-spec`, `to-tickets`, and
`diagnosing-bugs`. Existing installations may expose `to-prd`, `to-issues`,
and `diagnose`. The workflow registry records these aliases so client guidance
does not point to missing skills.

