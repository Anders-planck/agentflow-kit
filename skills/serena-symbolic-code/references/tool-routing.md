# Serena routing

Use Serena for semantic questions:

- Where is this symbol defined?
- Which symbols reference it?
- What will a rename or move affect?
- Where should a method or field be inserted?

Use ast-grep for syntactic shapes independent of symbol resolution. Use `rg`
for text, filenames, configuration, generated output, and logs. Use the native
patch/editor for a known local text change.

Before debugging missing results, verify project activation, ignored paths,
language backend, LSP startup, and the selected Serena context.

