# Contributing

Contributions are welcome when they preserve Orditra’s portability, reversibility, and least-exposure defaults.

## Set up

```bash
npm ci
npm run check
```

Use Node.js 22 or later. Keep generated credentials, local client state, Serena memories, coverage output, and temporary provider data out of the repository.

## Design rules

- Model user intent as a capability, implementation as a provider, and output as a client adapter.
- Keep `registered`, `project`, and globally active states distinct.
- Prefer compact skills with progressive disclosure; put detailed references or scripts beside the skill.
- Use text, structural, semantic, and repository-map search for different jobs rather than duplicating them.
- Make planners side-effect free and executor changes recoverable.
- Preserve unrelated client configuration and divergent project-local skills.
- Return stable findings instead of command-specific prose when output may reach CI.

## Adding a capability or provider

1. Add or update its JSON Schema-backed registry entry.
2. Record the official repository, full immutable commit or exact package version, executable/transport, supported clients, and risk properties.
3. Keep authenticated, write-capable, hook-bearing, or high-risk providers disabled by default.
4. Add the smallest provider planner and client rendering needed.
5. Add a profile only when it represents a reusable repository/workflow shape.
6. Test capability precedence, provider selection, conflicts, all supported client adapters, doctor behavior, and validation failures.
7. Document installation, authentication boundaries, and remediation.

If the capability is globally active and requires a local executable, add a pinned entry to `registry/dependencies.yaml`. Provide only package-manager commands whose prerequisite executable can be detected, test platform selection, and never add authenticated/high-risk or project-only providers to the global dependency installer.

## Adding an external skill source

Pin a full commit, hash the license, record review date/risk/permissions, and list SHA-256 digests for every copied file. Validation must fail closed if a file is missing, changed, or newly introduced without a digest. Run the optional agent-file scanner in a clean checkout before updating the lock.

## Verification

```bash
npm test
npm run coverage
npm run validate
npm run eval
npm run check
npm pack --dry-run
```

Also run `actionlint`, `gitleaks`, plugin validation, and skill validation when available. Add regression tests for every bug fix. Changes to routing or skill descriptions require an eval case; changes to a report require terminal and machine-readable snapshots or assertions.

## Pull requests

Keep each pull request focused. Explain the capability/risk change, migration behavior, affected clients, tests run, and any provider that becomes more exposed. Do not combine an unrelated dependency upgrade with behavior changes unless they are inseparable.
