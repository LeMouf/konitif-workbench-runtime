# @konitif/workbench-runtime

Public runtime orchestration for a KONITIF Workbench. It connects Workbench contracts to reactive application state without owning product semantics.

Products compose this runtime and provide their own tools, widgets, persistence adapters and policies.

## Autonomous distribution

Run `npm run build`, `npm test` and `npm run verify:package` from this
repository. The build emits ESM and declarations into `dist`; the verifier
packs that compiled allowlist, checks its exact contents and consumes both
public entries outside the source tree. No lifecycle script performs an
installation or publication.

The package depends on the published Workbench authority rather than a workspace
locator. Only the archive retained by the release verifier may be published.

## Explicit runtime entry

```ts
import {
  createWorkbenchStoreRuntime,
  type CreateWorkbenchStoreRuntimeOptions,
} from '@konitif/workbench-runtime/runtime';
```

This entry requires all six host ports: `workspacePersistence`,
`shellPersistence`, `focusPersistence`, `workspaceSync`, `hostEvents` and
`detachedWindows`. Only the last two accept `null`, explicitly disabling those
capabilities. Missing ports are rejected before providers are read.

Port types are exported from the same entry. Workspace contracts remain owned
by `@konitif/workbench/workspace-contracts`. The runtime owns its subscriptions,
not the supplied shared providers; call `flushPersistence()` before `dispose()`
if pending state must be saved. Disposal does not close native windows.

The root entry retains `createWorkbenchStore` and its browser defaults for
compatibility. The explicit entry selects no browser defaults, but still uses
Svelte stores, global debounce timers and the existing identity generator.

The npm distribution exposes compiled Node-compatible ESM and NodeNext
declarations. Repository sources remain TypeScript and are not included in the
archive.

## Host notifications

`createWorkbenchStore` accepts an optional `hostEvents` provider:

- Omitted: browser `pagehide`, `beforeunload`, hidden visibility and `storage` notifications.
- `null`: no subscriptions to those host events, even in a browser.
- `WorkbenchHostEvents`: explicit provider returning an unsubscribe function for each subscription.

The provider calls `onPersistenceBoundary()` or `onStorageChange({ key, newValue })`.
It does not own workspace state or perform persistence. The coordinator filters
storage notifications, reloads through its persistence ports and validates the
workspace. Disposal unsubscribes without destroying a shared provider; it does
not implicitly flush pending saves. Call `flushPersistence()` first when needed.

This option does not disable `workspaceSync`, detached-window controls or default
storage adapters. Supply those ports separately for a non-browser host.
