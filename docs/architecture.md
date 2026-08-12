# Architecture

Agentflow uses one canonical model and three adapters.

```text
presets + registries + skills + policy
                 |
                 v
          transactional planner
                 |
        +--------+---------+
        |        |         |
      Codex    Claude   OpenCode
      TOML/CLI plugin/MCP  JSONC
```

## Ownership

The toolkit owns only:

- release assets under the Agentflow XDG data directory;
- symlinks that point to those release assets;
- content inside explicit `agentflow-kit:start/end` blocks;
- config keys recorded in the install plan;
- external commands recorded with an inverse operation.

Unmanaged files and symlinks are preserved and reported as conflicts. Auth,
sessions, logs, client caches, context-mode data, and Serena memories are never
inputs to the renderer.

## Transaction

Before each mutation, Agentflow snapshots the original path under its XDG
state directory. Commands execute through official client CLIs and record an
inverse. A failure runs command inverses and restores path snapshots in reverse
order.

## Skill distribution

Bundled skills are copied into a versioned release directory. Pinned upstream
skills are fetched with Git into a temporary directory, validated for safe
paths, copied into the release, and accompanied by their license. Client skill
locations link to the same release content.

## Configuration precedence

```text
core defaults < preset < user config < local config < CLI flags
```

The initial preview implements core defaults, presets, and CLI flags. User and
local overlay migration is tracked for the first stable release.

