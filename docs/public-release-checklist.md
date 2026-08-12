# Public release checklist

## Identity

- [x] Choose the GitHub owner/repository and replace every `OWNER` placeholder.
- [x] Confirm the npm name and package provenance settings.
- [x] Review LICENSE, SECURITY.md, and upstream notices.

## Safety

- [x] Run `npm run check`.
- [x] Run a dedicated secret scanner over the entire Git history.
- [x] Confirm no backup, auth, session, memory, log, or rendered home file was staged.
- [x] Confirm fixtures use `example.com`, fake usernames, and temporary paths.
- [x] Inspect `git log -p` before the first public push.

## Behavior

- [x] Test minimal and recommended installs from clean temporary homes.
- [x] Test merge against pre-existing Codex, Claude, and OpenCode configs.
- [x] Verify second-run idempotence.
- [x] Verify failure rollback and explicit uninstall.
- [x] Run doctor on macOS and Linux.

## Release

- [x] Update CHANGELOG and compatibility versions.
- [ ] Tag the same commit used for the GitHub and npm artifacts.
- [ ] Verify checksums/provenance and install from the packed artifact.
- [ ] Keep the first release marked pre-release until tested by a new user.
