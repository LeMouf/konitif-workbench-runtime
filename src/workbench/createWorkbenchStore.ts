import { LocalWorkspacePersistence } from '@konitif/workbench';
import { createLocalWorkbenchShellPersistence } from './workbenchShellPersistence';
import { createLocalWorkbenchFocusPersistence } from './workbenchFocusPersistence';
import { createBrowserWorkspaceSyncController } from './workspaceSyncController';
import { createBrowserWorkbenchHostEvents } from './browserWorkbenchHostEvents';
import { createBrowserDetachedWindowHost } from './browserDetachedWindowHost';
import {
  createWorkbenchStoreRuntime,
  type CreateWorkbenchStoreRuntimeOptions
} from './createWorkbenchStoreRuntime';

type DefaultedPort = 'workspacePersistence' | 'shellPersistence' | 'focusPersistence' | 'workspaceSync' | 'hostEvents' | 'detachedWindows';

export type CreateWorkbenchStoreOptions =
  Omit<CreateWorkbenchStoreRuntimeOptions, DefaultedPort> &
  Partial<Pick<CreateWorkbenchStoreRuntimeOptions, DefaultedPort>>;

/** Compatible browser assembly. The runtime owns state, not provider selection. */
export function createWorkbenchStore(options: CreateWorkbenchStoreOptions) {
  const isEnabled = () => options.persistenceEnabled?.() ?? true;
  const workspacePersistence = options.workspacePersistence ?? new LocalWorkspacePersistence(options.persistenceKey);
  const shellPersistence = options.shellPersistence ?? createLocalWorkbenchShellPersistence({
    storageKey: options.shellPersistenceKey ?? `${options.persistenceKey}.shell`,
    isEnabled,
    shellWidgetCatalog: options.shellWidgetCatalog
  });
  const workspaceSync = options.workspaceSync ?? createBrowserWorkspaceSyncController({
    persistenceKey: options.persistenceKey,
    isEnabled
  });
  const focusPersistence = options.focusPersistence ?? createLocalWorkbenchFocusPersistence({
    storageKey: options.focusPersistenceKey ?? `${options.persistenceKey}.focus`,
    isEnabled
  });
  const runtime = createWorkbenchStoreRuntime({
    ...options,
    workspacePersistence,
    shellPersistence,
    focusPersistence,
    workspaceSync,
    hostEvents: options.hostEvents === undefined ? createBrowserWorkbenchHostEvents() : options.hostEvents,
    detachedWindows: options.detachedWindows === undefined ? createBrowserDetachedWindowHost() : options.detachedWindows
  });
  let disposed = false;
  return {
    ...runtime,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      try {
        runtime.dispose();
      } finally {
        if (!options.workspaceSync) workspaceSync.dispose?.();
      }
    }
  };
}
