---
name: performance-report
description: Capture browser performance traces and turn Core Web Vitals, network, console, and rendering evidence into actionable reports. Use when profiling web performance, diagnosing regressions, comparing builds, or producing a visual performance audit.
---

# Performance Report

## Workflow

1. Define the page, scenario, device, network, cache, and comparison baseline.
2. Use Chrome DevTools tooling for traces, network requests, console messages, and source-mapped stacks.
3. Record LCP, INP, CLS, FCP, TBT, resource weight, and critical request chains when available.
4. Tie each recommendation to trace evidence and estimated user impact.
5. Render structured findings as Markdown or self-contained HTML.

## Guardrails

- Do not open a remote-debugging port on a sensitive browser profile.
- Do not compare runs with different cache or throttling conditions without disclosure.
- Separate lab measurements from real-user monitoring.
- Avoid claiming causation from a single trace when evidence is only correlational.
