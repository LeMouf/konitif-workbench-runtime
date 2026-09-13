import assert from 'node:assert/strict';
import { test } from 'node:test';
import { get } from 'svelte/store';
import { createWorkspace } from '@konitif/workbench/workspace-contracts';
import { createWorkbenchStore } from '../dist/index.js';
import { createWorkbenchStoreRuntime } from '../dist/runtime.js';

test('strict runtime uses explicit ports and preserves the Workbench authority', () => {
  assert.equal(typeof createWorkbenchStore, 'function');
  const workspace = createWorkspace();
  let saves = 0;
  let unsubscribes = 0;
  const runtime = createWorkbenchStoreRuntime({
    initialToolId: 'missing',
    persistenceKey: 'runtime-test',
    hostEvents: null,
    detachedWindows: null,
    toolCatalog: { getDefinition: () => undefined },
    shellWidgetCatalog: { getDefinition: () => undefined },
    workspacePersistence: { load: () => workspace, save: () => { saves += 1; } },
    shellPersistence: { load: fallback => fallback, save() {}, serialize: JSON.stringify, normalize: (_, fallback) => fallback },
    focusPersistence: { load: (_, fallback) => fallback, save() {}, serialize: JSON.stringify, normalize: (_, __, fallback) => fallback },
    workspaceSync: {
      publish() {},
      subscribe: () => () => { unsubscribes += 1; },
      dispose() { throw new Error('The runtime must not dispose a supplied shared provider'); },
    },
  });
  assert.deepEqual(get(runtime.workspaceStore).workspace, workspace);
  runtime.flushPersistence();
  assert.equal(saves, 1);
  runtime.dispose();
  runtime.dispose();
  assert.equal(unsubscribes, 1);
});

test('strict runtime rejects a missing required host port', () => {
  assert.throws(() => createWorkbenchStoreRuntime({}), /required/i);
});
