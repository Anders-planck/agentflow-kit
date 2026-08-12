# Patterns and safety

Search for a TypeScript call guarded by the same property:

```bash
sg -p '$PROP && $PROP()' -l ts src
```

Preview an optional-call rewrite interactively:

```bash
sg -p '$PROP && $PROP()' --rewrite '$PROP?.()' --interactive -l ts src
```

For project rules, add `sgconfig.yml` with a `ruleDirs` entry and keep rule
tests beside the rules. A useful test suite contains matching input,
non-matching near misses, and expected rewritten output.

Never use structural rewrite as a substitute for a symbol-aware rename.

