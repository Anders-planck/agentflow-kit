---
name: serena-symbolic-code
description: Uses Serena MCP for symbol discovery, references, dependency understanding, and precise symbol-level edits. Use for cross-file navigation, safe refactors, semantic code changes, or when text and syntax search cannot establish symbol relationships.
license: MIT
compatibility: Requires the Serena MCP server and an activated project.
metadata:
  author: orditra
  version: "0.1.0"
---

# Serena Symbolic Code

## Workflow

1. Confirm the current repository is activated in Serena.
2. Discover symbols before requesting bodies or references.
3. Read only the definitions needed for the task.
4. Inspect referencing symbols before renaming, moving, or deleting code.
5. Use symbol-level insertion/replacement for semantic edits.
6. Review the normal git diff and run relevant tests afterward.

See [tool routing](references/tool-routing.md) for when Serena is not the right tool.

## Guardrails

- Serena operations are MCP tools, not assumed shell subcommands.
- Do not use Serena for logs, Markdown prose, config strings, or filename search.
- Avoid onboarding ephemeral repositories unless memories will be reused.
- Do not treat zero results as proof until project activation and language support are verified.
- Prefer the client-specific Serena context configured by Orditra.

