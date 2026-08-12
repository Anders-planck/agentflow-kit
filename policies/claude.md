# Orditra integration for Claude Code

Follow the shared Orditra core policy. Load skill bodies progressively and
avoid duplicating plugin-provided skills with user-level copies.

Route large output through context-mode. Prefer Serena MCP tools for semantic
navigation and ast-grep for structural patterns. Keep `rg` for text search.

Before workflow skills that depend on tracker or domain documentation, check
whether project bootstrap has completed.

Keep user-scope MCP configuration limited to capabilities intentionally marked
`auto` or `always`; prefer project scope for browser, performance, architecture,
and repository-specific providers. Verify generated settings before applying.
