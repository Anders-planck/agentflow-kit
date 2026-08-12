# Contributing

## Development

```bash
npm install
npm test
node dist/src/cli.js validate --root .
```

Keep config mutations reversible and test them with temporary home directories.
Never use a real auth file as a fixture. New skill sources must pin a full
commit, record a license, and use repository-relative paths without `..`.

## Skills

- Keep `SKILL.md` concise and use one-level `references/` for details.
- Descriptions must state what the skill does and when it triggers.
- Add routing eval cases for positive, negative, and collision behavior.
- Do not introduce client-only frontmatter into portable skills.

## Pull requests

Explain ownership boundaries, rollback behavior, and how existing unmanaged
configuration is preserved. Include tests for clean install, merge, second-run
idempotence, and removal when the change affects deployment.

