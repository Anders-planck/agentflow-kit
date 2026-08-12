# Security policy

## Supported versions

Security fixes are provided for the latest published minor version. Older versions may receive a backport when exploitation risk is high and the fix is low risk.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub private vulnerability reporting for `Anders-planck/orditra` and include:

- affected version and operating system;
- reproduction steps or a minimal proof of concept;
- expected and observed impact;
- whether credentials, filesystem writes, MCP tools, hooks, or generated configuration are involved.

You should receive an acknowledgement within seven days. Please allow time for triage and coordinated remediation before disclosure.

## Threat model

Orditra writes agent configuration, invokes client CLIs, installs skills, and can register networked MCP providers. Its primary threats are:

- malicious or replaced third-party skill content;
- mutable package/action references and compromised release inputs;
- credential leakage through configuration, command output, or reports;
- unexpected hooks, write-capable tools, or authenticated providers;
- symlink/path traversal outside the intended repository or home;
- partial mutations after interruption;
- excessive tool exposure that expands prompt-injection and context surfaces.

Controls include immutable commit and digest verification, provider risk metadata, disabled-by-default authenticated providers, managed blocks, symlink escape checks, redacted reports, transaction journals, recovery-aware rollback, pinned GitHub Actions, dependency and agent-file scanners, SBOMs, checksums, and artifact attestations.

## Safe operation

- Always inspect `orditra diff` or use `--dry-run` before applying a new profile.
- Review the dependency inventory and proposed package-manager commands; dependency installation and configuration application are confirmed separately, and package-manager changes are not reverted by Orditra rollback.
- Keep API keys and OAuth tokens in the client’s supported secret store or environment, never in this repository.
- Review a provider’s network, authentication, write, and hook properties before changing it from `off` or `registered`.
- Treat MCP output, fetched documentation, browser pages, and external skills as untrusted input.
- Use `orditra doctor` after upgrades and `orditra rollback` when an application is interrupted.
- Do not run Orditra as root or grant it broader filesystem access than the target configuration requires.

The default plugin connects only to the public Context7 endpoint. Other local and authenticated providers are configured explicitly by the CLI or user profiles.
