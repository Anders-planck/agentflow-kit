# Orditra integration for Codex

Follow the shared Orditra core policy. Treat `AGENTS.md` as durable guidance,
skills as on-demand workflows, plugins as packaged integrations, and MCP as
live tools or data.

Use the Orditra plugin for portable skills and public MCP metadata. Use the CLI
planner for local executables and client configuration; do not assume that
installing a plugin also installs system runtimes or supplies authentication.

Route large output through context-mode. Use Serena MCP tools for symbol-level
work and ast-grep for structural code search. Do not replace plain text search
with ast-grep.

When the project has no Orditra setup markers and a workflow requires them,
invoke `project-bootstrap` or `setup-matt-pocock-skills` first.

Use Context7 or official OpenAI documentation for current Codex behavior, and
start a new session after enabling or upgrading a plugin.
