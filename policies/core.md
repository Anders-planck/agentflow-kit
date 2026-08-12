# Orditra core policy

Use skills as the workflow layer and load their bodies only when the task
matches. Respect explicit user choices over automatic routing.

Use context-mode for large or uncertain output, Serena for semantic symbol and
reference work, ast-grep for syntactic structures and rewrites, and ripgrep for
plain text, filenames, logs, and configuration strings.

Do not expose secrets, credentials, auth files, private endpoints, or session
state. Preview broad or destructive changes, preserve unrelated user edits,
and verify every mutation proportionally to risk.

On a new repository, check project setup before invoking workflow skills that
depend on an issue tracker, triage labels, CONTEXT.md, or ADR locations.

