# Workbench Runtime 0.284.1 baseline

This repository is the source and release authority for
`@konitif/workbench-runtime`.

The package adapts public Workbench contracts to Svelte stores and explicit
host ports. It does not own Workbench workspace semantics, product tools,
viewer projections or partner-specific behavior.

Baseline dependencies:

- `@konitif/workbench@0.284.1`;
- `svelte@^4.2.18`;
- `typescript@5.9.3` for the autonomous build only.

The release payload is compiled ESM plus declarations. Source files, tests,
repository policy and workflows remain public repository material but are not
part of the npm archive.
