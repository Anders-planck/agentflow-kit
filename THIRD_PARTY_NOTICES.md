# Third-party notices

Orditra does not vendor external executables or MCP servers. It records their
immutable provenance and configures them only when the selected capability is
active.

The optional Matt Pocock skill collection is fetched from the commit pinned in
`registry/skill-sources.lock.yaml`. Its MIT license is copied beside installed
skills at `.licenses/mattpocock/LICENSE` and its content is verified with the
SHA-256 digests in that lockfile.

Runtime npm dependencies and their transitive licenses are recorded by
`package-lock.json`. Release automation produces an SPDX JSON SBOM for every
published archive.

Provider repositories, versions, permissions, and risk classifications are
listed in `registry/providers.yaml`. Their inclusion in the registry is not an
endorsement and does not change their respective licenses.
