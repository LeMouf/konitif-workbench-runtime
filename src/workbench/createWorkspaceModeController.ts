import { get, writable, type Readable, type Unsubscriber } from 'svelte/store';
import type { WorkspaceCommand } from '@konitif/workbench';
import type { createWorkbenchStore } from './createWorkbenchStore';

type WorkbenchStore = ReturnType<typeof createWorkbenchStore>;
type WorkspaceActions = WorkbenchStore['workspaceActions'];
type WorkspaceState = Parameters<WorkbenchStore['workspaceStore']['subscribe']>[0] extends (
  value: infer State
) => void
  ? State
  : never;
type WorkspaceHistoryState = Parameters<WorkbenchStore['workspaceHistoryStore']['subscribe']>[0] extends (
  value: infer State
) => void
  ? State
  : never;
type WorkspaceActionName = keyof WorkspaceActions;

export interface WorkspaceModeControllerOptions<Mode extends string> {
  initialMode: Mode;
  modes?: readonly Mode[];
  stores?: Record<Mode, WorkbenchStore>;
  getStore?: (mode: Mode) => WorkbenchStore;
  isWorkspaceCommandBlocked?: (mode: Mode, command: WorkspaceCommand) => boolean;
  isWorkspaceActionBlocked?: (mode: Mode, action: WorkspaceActionName) => boolean;
  resolveBlockedWorkspaceAction?: (context: {
    mode: Mode;
    action: WorkspaceActionName;
    store: WorkbenchStore;
  }) => ((...args: unknown[]) => unknown) | null | undefined;
  onModeActivated?: (mode: Mode, store: WorkbenchStore) => void;
  onWorkspaceReset?: (mode: Mode, store: WorkbenchStore) => void;
}

export interface WorkspaceModeController<Mode extends string> {
  activeMode: Readable<Mode>;
  workspaceStore: Readable<WorkspaceState>;
  workspaceHistoryStore: Readable<WorkspaceHistoryState>;
  workspaceActions: WorkspaceActions;
  setActiveMode: (mode: Mode) => void;
  suspendMode: (mode: Mode) => void;
  resumeMode: (mode: Mode) => void;
  getWorkspaceActionsForMode: (mode: Mode) => WorkspaceActions;
  getWorkspaceStateForMode: (mode: Mode) => WorkspaceState;
}

export function createWorkspaceModeController<Mode extends string>(
  options: WorkspaceModeControllerOptions<Mode>
): WorkspaceModeController<Mode> {
  const activeModeStore = writable<Mode>(options.initialMode);
  const suspendedModes = new Set<Mode>();
  const refreshReaders = new Set<() => void>();

  function getStoreForMode(mode: Mode): WorkbenchStore {
    if (suspendedModes.has(mode)) throw new Error(`Workbench mode "${mode}" is suspended.`);
    const store = options.getStore?.(mode) ?? options.stores?.[mode];

    if (!store) {
      throw new Error(`No workbench store registered for mode "${mode}".`);
    }

    return store;
  }

  function createActiveReadable<T>(selectStore: (store: WorkbenchStore) => Readable<T>): Readable<T> {
    return {
      subscribe(run, invalidate) {
        if (suspendedModes.has(get(activeModeStore))) {
          throw new Error(`Workbench mode "${get(activeModeStore)}" is suspended.`);
        }
        let activeUnsubscribe: Unsubscriber | null = null;

        const refresh = () => {
          activeUnsubscribe?.();
          activeUnsubscribe = null;
          const mode = get(activeModeStore);
          if (suspendedModes.has(mode)) return;
          activeUnsubscribe = selectStore(getStoreForMode(mode)).subscribe(run, invalidate);
        };
        refreshReaders.add(refresh);
        const modeUnsubscribe = activeModeStore.subscribe(refresh);

        return () => {
          activeUnsubscribe?.();
          modeUnsubscribe();
          refreshReaders.delete(refresh);
        };
      }
    };
  }

  function createActionProxy<T extends object>(resolveTarget: () => T): T {
    return new Proxy({} as T, {
      ownKeys() {
        return Reflect.ownKeys(resolveTarget());
      },

      getOwnPropertyDescriptor(_target, property) {
        const descriptor = Reflect.getOwnPropertyDescriptor(resolveTarget(), property);

        return descriptor
          ? {
              ...descriptor,
              configurable: true,
              enumerable: true
            }
          : undefined;
      },

      has(_target, property) {
        return property in resolveTarget();
      },

      get(_target, property) {
        const value = Reflect.get(resolveTarget(), property);

        if (typeof value === 'function') {
          return (...args: unknown[]) => (Reflect.get(resolveTarget(), property) as (...values: unknown[]) => unknown)(...args);
        }

        return value;
      }
    });
  }

  function createWorkspaceActionsForMode(mode: Mode): WorkspaceActions {
    const toolRuntimeActions = createActionProxy<WorkspaceActions['toolRuntime']>(
      () => getStoreForMode(mode).workspaceActions.toolRuntime
    );

    return new Proxy({ toolRuntime: toolRuntimeActions } as WorkspaceActions, {
      get(target, property) {
        const store = getStoreForMode(mode);

        if (property === 'toolRuntime') {
          return target.toolRuntime;
        }

        if (property === 'dispatchCommand') {
          return (command: WorkspaceCommand) => {
            if (options.isWorkspaceCommandBlocked?.(mode, command)) {
              return;
            }

            getStoreForMode(mode).workspaceActions.dispatchCommand(command);
          };
        }

        if (property === 'resetWorkspace') {
          return () => {
            const current = getStoreForMode(mode);
            current.workspaceActions.resetWorkspace();
            options.onWorkspaceReset?.(mode, current);
          };
        }

        if (options.isWorkspaceActionBlocked?.(mode, property as WorkspaceActionName)) {
          const blockedAction = options.resolveBlockedWorkspaceAction?.({
            mode,
            action: property as WorkspaceActionName,
            store
          });

          return blockedAction ?? (() => undefined);
        }

        const value = Reflect.get(store.workspaceActions, property);

        if (typeof value === 'function') {
          return (...args: unknown[]) => Reflect.get(getStoreForMode(mode).workspaceActions, property)(...args);
        }

        return value;
      }
    });
  }

  const workspaceActionsByMode = Object.fromEntries(
    resolveWorkspaceModes().map((mode) => [
      mode,
      createWorkspaceActionsForMode(mode)
    ])
  ) as Record<Mode, WorkspaceActions>;

  const activeToolRuntimeActions = createActionProxy<WorkspaceActions['toolRuntime']>(
    () => workspaceActionsByMode[get(activeModeStore)].toolRuntime
  );

  const activeWorkspaceActions = new Proxy({ toolRuntime: activeToolRuntimeActions } as WorkspaceActions, {
    get(target, property) {
      if (property === 'toolRuntime') {
        return target.toolRuntime;
      }

      const value = Reflect.get(workspaceActionsByMode[get(activeModeStore)], property);

      if (typeof value === 'function') {
        return (...args: unknown[]) => (Reflect.get(workspaceActionsByMode[get(activeModeStore)], property) as (...values: unknown[]) => unknown)(...args);
      }

      return value;
    }
  });

  return {
    activeMode: {
      subscribe: activeModeStore.subscribe
    },
    workspaceStore: createActiveReadable<WorkspaceState>((store) => store.workspaceStore),
    workspaceHistoryStore: createActiveReadable<WorkspaceHistoryState>((store) => store.workspaceHistoryStore),
    workspaceActions: activeWorkspaceActions,
    suspendMode(mode) {
      if (suspendedModes.has(mode)) return;
      suspendedModes.add(mode);
      if (get(activeModeStore) === mode) for (const refresh of [...refreshReaders]) refresh();
    },
    resumeMode(mode) {
      if (!suspendedModes.delete(mode)) return;
      if (get(activeModeStore) === mode) for (const refresh of [...refreshReaders]) refresh();
    },
    setActiveMode(mode) {
      const store = getStoreForMode(mode);

      if (get(activeModeStore) !== mode) {
        activeModeStore.set(mode);
      }

      options.onModeActivated?.(mode, store);
    },
    getWorkspaceActionsForMode(mode) {
      return workspaceActionsByMode[mode];
    },
    getWorkspaceStateForMode(mode) {
      return get(getStoreForMode(mode).workspaceStore);
    }
  };

  function resolveWorkspaceModes(): readonly Mode[] {
    if (options.modes) {
      return options.modes;
    }

    if (options.stores) {
      return Object.keys(options.stores) as Mode[];
    }

    return [options.initialMode];
  }
}
