# @konitif/workbench-runtime

Reactive Svelte host adapter for assembling public KONITIF Workbench contracts
with explicit runtime ports.

## Installation

```sh
npm install @konitif/workbench-runtime
```

## What it provides

- Reactive Workbench stores and shell actions.
- Workspace history and synchronization controllers.
- Explicit ports for persistence, host events and detached windows.
- A runtime assembly entry that selects no browser providers by default.

## Authority boundary

This package adapts Workbench authorities; it does not redefine workspace
semantics or own product tools, widgets, Viewers or policies. Supplied providers
remain owned by their hosts. Runtime disposal removes subscriptions but does not
implicitly flush persistence or close shared native resources.

## Quick start

```ts
import { createWorkbenchStore } from '@konitif/workbench-runtime';

const emptyCatalog = { getDefinition: () => undefined };
const runtime = createWorkbenchStore({
  initialToolId: 'home',
  persistenceKey: 'example-workbench',
  toolCatalog: emptyCatalog,
  shellWidgetCatalog: emptyCatalog,
});

runtime.dispose();
```

The root entry supplies browser-oriented defaults. Import
`@konitif/workbench-runtime/runtime` when persistence, synchronization, host
events and detached-window providers must all be supplied explicitly. Call
`flushPersistence()` before `dispose()` when pending state must be saved.

## Public entry points

| Entry | Purpose |
| --- | --- |
| `@konitif/workbench-runtime` | Existing store API and compatibility defaults. |
| `@konitif/workbench-runtime/runtime` | Explicit six-port runtime assembly. |

## Reference

See [`reference/`](reference/) for the machine-readable capability catalog and
authority diagrams. The catalogs document the adapter and are not persisted
workspace state.

## License

Source-available under [PolyForm Noncommercial 1.0.0](LICENSE.md), not OSI open
source. Commercial use requires separate written authorization.
