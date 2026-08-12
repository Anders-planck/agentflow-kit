# Security policy

## Supported versions

Security fixes are applied to the latest minor release. Pre-release builds are
for evaluation only and must be reviewed with `orditra diff` before use.

## Reporting a vulnerability

Do not open a public issue for credentials, path traversal, unsafe config
merges, command injection, or destructive rollback behavior. Use GitHub's
private vulnerability reporting for this repository.

Include the affected version, operating system, client versions, a redacted
reproduction, and whether a secret may have entered Git history. Never attach
real auth files or unredacted diagnostic output.

## Security boundaries

- Orditra never owns client authentication files.
- Secrets are referenced by environment-variable name, never stored as values.
- Mutating commands support dry-run and back up every changed file.
- Existing unmanaged files and symlinks are preserved by default; explicit
  adoption snapshots them before replacement.
- External skill sources are pinned to commits and checked for path traversal.
- `doctor --json` redacts home paths and does not print configuration contents.
