# Public release checklist

## Identity

- [ ] Choose the GitHub owner/repository and replace every `OWNER` placeholder.
- [ ] Confirm the npm name and package provenance settings.
- [ ] Review LICENSE, SECURITY.md, and upstream notices.

## Safety

- [ ] Run `npm run check`.
- [ ] Run a dedicated secret scanner over the entire Git history.
- [ ] Confirm no backup, auth, session, memory, log, or rendered home file was staged.
- [ ] Confirm fixtures use `example.com`, fake usernames, and temporary paths.
- [ ] Inspect `git log -p` before the first public push.

## Behavior

- [ ] Test minimal and recommended installs from clean temporary homes.
- [ ] Test merge against pre-existing Codex, Claude, and OpenCode configs.
- [ ] Verify second-run idempotence.
- [ ] Verify failure rollback and explicit uninstall.
- [ ] Run doctor on macOS and Linux.

## Release

- [ ] Update CHANGELOG and compatibility versions.
- [ ] Tag the same commit used for the GitHub and npm artifacts.
- [ ] Verify checksums/provenance and install from the packed artifact.
- [ ] Keep the first release marked pre-release until tested by a new user.

