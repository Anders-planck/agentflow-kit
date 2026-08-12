---
name: agent-supply-chain
description: Audit agent skills, MCP servers, plugins, hooks, prompts, permissions, pins, licenses, and content digests before activation. Use when adding, updating, publishing, or reviewing any external agent capability or configuration bundle.
---

# Agent Supply Chain

## Workflow

1. Resolve the exact repository, commit, package version, subpath, and license.
2. Fetch into quarantine and verify content digests before copying.
3. Inspect prompts, scripts, hooks, network use, credentials, writes, and paths outside the project.
4. Run Agent Scan when available and preserve its findings.
5. Classify risk and require explicit opt-in for authenticated, high-risk, or side-effectful capabilities.
6. Record review date, provenance, permissions, and attribution in the lockfile.

## Guardrails

- Reject floating branches, tags, package versions, and GitHub Action references.
- Do not execute quarantined code to decide whether it is safe.
- Do not silently enable connectors that require authentication.
- Fail closed on digest mismatch or unsafe path traversal.
