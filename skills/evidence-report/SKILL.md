---
name: evidence-report
description: Convert engineering findings into concise terminal, JSON, Markdown, SARIF, HTML, and Mermaid-backed reports. Use when users request audits, status reports, diagnostics, architecture summaries, security findings, or reviewable evidence artifacts.
---

# Evidence Report

## Workflow

1. Normalize every result into status, capability, summary, evidence, remediation, and source.
2. Separate observed evidence from inference.
3. Choose terminal for interaction, JSON for automation, Markdown for review, SARIF for code scanning, or HTML for a standalone visual artifact.
4. Use Mermaid only when relationships are clearer as a graph or flow.
5. Redact secrets and machine-specific personal paths before publishing.

## Guardrails

- Generate every format from one finding model.
- Keep HTML self-contained and free of remote assets.
- Do not add remote telemetry by default.
- Write large artifacts to files and return their paths.
