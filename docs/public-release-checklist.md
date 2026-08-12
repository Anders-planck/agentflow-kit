# Public release checklist

## Source and metadata

- [ ] Working tree contains only intended changes and `git diff --check` passes.
- [ ] Package, plugin manifest, changelog, and release tag use the same SemVer.
- [ ] README install examples and compatibility data match the released CLI.
- [ ] No personal absolute paths, secrets, private endpoints, or generated memories are tracked.
- [ ] `THIRD_PARTY_NOTICES.md` and every external license digest are current.

## Reproducibility and security

- [ ] External skill sources use full immutable commits and verified per-file SHA-256 digests.
- [ ] GitHub Actions use full commit SHAs.
- [ ] `npm ci --ignore-scripts` and `npm audit` pass.
- [ ] Agent Scan, OSV-Scanner, zizmor, CodeQL, and OpenSSF Scorecard checks pass or have a documented accepted finding.
- [ ] Authenticated/high-risk providers remain disabled by default.
- [ ] Generated files contain no credentials.

## Product verification

- [ ] `npm run check` passes.
- [ ] `npm run coverage` completes and changed critical paths have tests.
- [ ] `npm run eval` passes the routing eval suite.
- [ ] Every `SKILL.md` passes `quick_validate.py` and every `agents/openai.yaml` is valid.
- [ ] The root Codex plugin passes `validate_plugin.py`.
- [ ] `actionlint` and `gitleaks` pass when installed.
- [ ] Dry runs for Codex, Claude Code, and OpenCode produce only expected managed changes.
- [ ] Dependency inventory is correct on macOS, Linux, and Windows; missing dependencies require separate consent and optional providers are excluded.
- [ ] Schema-v1 migration, rollback, interrupted-transaction recovery, and garbage collection are exercised.

## Artifact verification

- [ ] `npm pack --dry-run` contains schemas, registries, skills, plugin files, notices, and no development secrets.
- [ ] Release artifacts include the npm tarball, full source archive, `SHA256SUMS`, and SPDX SBOM.
- [ ] GitHub artifact attestations verify against the public repository.
- [ ] A clean temporary install prints the expected version and completes `orditra validate`.
- [ ] npm trusted publishing succeeds without a long-lived registry token.

## Publication

- [ ] Create the signed or protected tag only after all checks pass.
- [ ] Publish GitHub release and npm package from the release workflow.
- [ ] Verify the public Codex marketplace source with `codex plugin marketplace add owner/repo --ref <tag>` and `/plugins`.
- [ ] Start a new client session and run a smoke task using the bundled workflow router.
