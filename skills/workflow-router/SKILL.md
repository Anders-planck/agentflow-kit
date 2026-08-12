---
name: workflow-router
description: Routes engineering work to the smallest suitable skill flow and checks prerequisites. Use when a request spans setup, discovery, planning, implementation, diagnosis, architecture, verification, or handoff and the correct workflow is not already explicit.
license: MIT
metadata:
  author: orditra
  version: "0.2.0"
---

# Workflow Router

Requires Agent Skills support and uses only skills available in the active client.

## Route

1. Classify the request by outcome, not keywords alone.
2. Respect any skill or workflow the user explicitly selected.
3. Check project prerequisites before tracker- or domain-dependent skills.
4. Choose the smallest flow that can complete the request.
5. Load only the selected skill bodies; do not preload the catalog.
6. Skip stages that do not contribute to the requested outcome.

See [routing reference](references/routing.md) for stage mappings and conflicts.

## Guardrails

- Do not run setup repeatedly when project markers already exist.
- Do not force TDD for docs, config-only work, or pure investigation.
- Do not turn a diagnosis request into an implementation unless requested.
- Do not create issues, publish artifacts, or mutate external systems without scope.
- Use installed aliases when an upstream skill was renamed.

## Output

State the chosen skill or compact flow only when doing so helps the user follow
the work. Continue directly when routing is obvious.
