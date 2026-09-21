import { derived, get, writable } from 'svelte/store';
import type { WorkbenchHostEvents } from './workbenchHostEvents';
import type { WorkbenchShellPersistencePort } from './workbenchShellPersistence';
import type { WorkbenchFocusPersistencePort } from './workbenchFocusPersistence';
import { createWorkbenchShellActions } from './workbenchShellActions';
import { createWorkbenchToolRuntimeActions } from './workbenchToolRuntimeActions';
import type { WorkbenchHistoryScope } from './workspaceHistoryController';
import type { WorkspaceSyncController } from './workspaceSyncController';
import { createWorkbenchLayoutActions } from './workbenchLayoutActions';
import { createWorkbenchHistoryActions } from './workbenchHistoryActions';
import {
  createWorkbenchWorkspaceActions,
  type InitialWorkbenchWorkspaceMode
} from './workbenchWorkspaceActions';
import { createWorkbenchWindowRuntime } from './workbenchWindowRuntime';
import type { WorkbenchDetachedWindowHost } from './workbenchDetachedWindowHost';
import { createWorkbenchToolRuntimeUiStore } from './workbenchToolRuntimeUiStore';
import { createWorkbenchPersistenceRuntime } from './workbenchPersistenceRuntime';
import { createWorkbenchStateFactory, type WorkbenchState } from './workbenchStateFactory';
import { createWorkbenchHistoryRuntime, type WorkbenchSnapshot } from './workbenchHistoryRuntime';
import {
  createWorkspaceSessionState,
  dismissLayoutInteraction,
  type ShellRegionId,
  type ShellWidgetCatalog,
  type ToolCatalog,
  type WorkspaceCommand,
  type WorkspacePersistencePort
} from '@konitif/workbench/workspace-contracts';

type HistoryScope = WorkbenchHistoryScope;
type InitialWorkspaceMode = InitialWorkbenchWorkspaceMode;

export interface CreateWorkbenchStoreRuntimeOptions {
  initialToolId: string;
  persistenceKey: string;
  shellPersistenceKey?: string;
  focusPersistenceKey?: string;
  toolCatalog: ToolCatalog;
  shellWidgetCatalog: ShellWidgetCatalog;
  workspacePersistence: WorkspacePersistencePort;
  shellPersistence: WorkbenchShellPersistencePort;
  focusPersistence: WorkbenchFocusPersistencePort;
  workspaceSync: WorkspaceSyncController;
  /** Explicit provider; null disables host notifications. */
  hostEvents: WorkbenchHostEvents | null;
  detachedWindows: WorkbenchDetachedWindowHost | null;
  persistenceDebounceMs?: number;
  initialWorkspaceMode?: InitialWorkspaceMode;
  initialStackHeaderVisible?: boolean;
  defaultOpenShellRegions?: ShellRegionId[];
  persistenceEnabled?: () => boolean;
  coherentPersistence?: {
    initialState: import('./workbenchPersistenceRuntime').WorkbenchPersistenceState;
    coordinator: import('./workbenchPersistenceRuntime').WorkbenchPersistenceCoordinator<WorkbenchState>;
  };
}

export function createWorkbenchStoreRuntime(options: CreateWorkbenchStoreRuntimeOptions) {
  for (const key of ['workspacePersistence', 'shellPersistence', 'focusPersistence', 'workspaceSync', 'hostEvents', 'detachedWindows'] as const) {
    if (options[key] === undefined || (key !== 'hostEvents' && key !== 'detachedWindows' && options[key] === null)) {
      throw new TypeError(`Missing required Workbench port: ${key}`);
    }
  }
  let disposed = false;
  const persistence = options.workspacePersistence;
  const shellPersistenceKey = options.shellPersistenceKey ?? `${options.persistenceKey}.shell`;
  const focusPersistenceKey = options.focusPersistenceKey ?? `${options.persistenceKey}.focus`;
  const persistenceDebounceMs = Math.max(0, options.persistenceDebounceMs ?? 120);

  function isPersistenceEnabled(): boolean {
    return options.persistenceEnabled?.() ?? true;
  }

  const shellPersistence = options.shellPersistence;
  const workspaceSync = options.workspaceSync;
  const focusPersistence = options.focusPersistence;
  const stateFactory = createWorkbenchStateFactory({
    initialToolId: options.initialToolId,
    toolCatalog: options.toolCatalog,
    shellWidgetCatalog: options.shellWidgetCatalog,
    initialWorkspaceMode: options.initialWorkspaceMode,
    initialStackHeaderVisible: options.initialStackHeaderVisible,
    defaultOpenShellRegions: options.defaultOpenShellRegions
  });
  const { createInitialWorkspace, createShellFallback, createWorkbenchState } = stateFactory;

  const initialWorkspace = options.coherentPersistence?.initialState.workspace ?? (isPersistenceEnabled()
    ? (persistence.load() ?? createWorkbenchState().workspace)
    : createWorkbenchState().workspace);
  const initialShell = options.coherentPersistence?.initialState.shell ?? shellPersistence.load(createShellFallback());
  const fallbackSession = createWorkspaceSessionState(initialWorkspace);
  const initialFocus = options.coherentPersistence?.initialState.focus ?? focusPersistence.load(initialWorkspace, fallbackSession.focus);
  const internalWorkspaceStore = writable(
    createWorkbenchState(createWorkspaceSessionState(initialWorkspace, initialFocus), initialShell)
  );
  const toolRuntimeUi = createWorkbenchToolRuntimeUiStore(() => get(internalWorkspaceStore).workspace);
  const historyRuntime = createWorkbenchHistoryRuntime<WorkbenchState>();

  const persistenceCoordinator = options.coherentPersistence?.coordinator ?? createWorkbenchPersistenceRuntime({
    persistenceKey: options.persistenceKey,
    shellPersistenceKey,
    focusPersistenceKey,
    persistenceDebounceMs,
    shellWidgetCatalog: options.shellWidgetCatalog,
    defaultOpenShellRegions: options.defaultOpenShellRegions,
    initialWorkspace,
    initialShell,
    initialFocus,
    workspacePersistence: persistence,
    shellPersistence,
    focusPersistence,
    workspaceSync,
    hostEvents: options.hostEvents,
    isPersistenceEnabled,
    getWorkbenchState: () => get(internalWorkspaceStore),
    createWorkbenchState,
    setWorkbenchState
  });

  function flushWorkspacePersistence(): void {
    persistenceCoordinator.flush();
  }

  function updateWorkbenchState(
    updater: (state: WorkbenchState) => WorkbenchState,
    historyScope: HistoryScope = 'both'
  ): void {
    if (disposed) return;
    internalWorkspaceStore.update((state) => {
      const updatedState = updater(state);
      const provenance = state.workspace.presetProvenance;
      const presetContentChanged =
        provenance?.status === 'exact' &&
        (updatedState.workspace !== state.workspace || updatedState.shell !== state.shell);
      const nextState = presetContentChanged
        ? {
            ...updatedState,
            workspace: {
              ...updatedState.workspace,
              presetProvenance: {
                ...provenance,
                status: 'customized' as const
              }
            }
          }
        : updatedState;
      historyRuntime.recordTransition(state, nextState, historyScope);
      return nextState;
    });
  }

  function setWorkbenchState(nextState: WorkbenchState, historyScope: HistoryScope = 'both'): void {
    if (disposed) return;
    internalWorkspaceStore.update((state) => {
      historyRuntime.recordTransition(state, nextState, historyScope);
      return nextState;
    });
  }

  function restoreHistorySnapshot(snapshot: WorkbenchSnapshot<WorkbenchState>): WorkbenchState {
    return createWorkbenchState(
      createWorkspaceSessionState(snapshot.workspace, snapshot.focus),
      snapshot.shell,
      dismissLayoutInteraction()
    );
  }

  function resolveWorkspaceCommandHistoryScope(command: WorkspaceCommand): HistoryScope {
    switch (command.type) {
      case 'open-tool':
      case 'open-tool-in-panel':
      case 'open-tool-in-new-tab':
      case 'unassign-tool':
      case 'split-panel-horizontal':
      case 'split-panel-vertical':
      case 'split-panel-to-side':
      case 'join-panel-area':
      case 'swap-panel-area':
      case 'close-active-panel':
      case 'close-panel':
      case 'detach-panel-to-window':
      case 'focus-panel':
      case 'activate-tab':
      case 'set-stack-header-visibility':
      case 'set-panel-fullscreen-toggle-visibility':
      case 'run-tool-shell-command':
        return 'app';
    }
  }

  const toolRuntimeActions = createWorkbenchToolRuntimeActions({
    toolCatalog: options.toolCatalog,
    workspaceHistory: historyRuntime.controller,
    getWorkbenchState: () => get(internalWorkspaceStore),
    createHistorySnapshot: historyRuntime.createSnapshot,
    restoreHistorySnapshot,
    createWorkbenchState,
    updateWorkbenchState,
    setWorkbenchState,
    syncHistoryStatus: historyRuntime.syncStatus,
    setToolPanelLoadingState(toolInstanceId, nextLoading) {
      if (disposed) return false;
      return toolRuntimeUi.setToolPanelLoadingState(toolInstanceId, nextLoading);
    },
    setToolResourceLoadingState(toolInstanceId, nextLoading) {
      if (disposed) return false;
      return toolRuntimeUi.setToolResourceLoadingState(toolInstanceId, nextLoading);
    },
    setToolShellStatusState(toolInstanceId, nextStatus) {
      if (disposed) return false;
      return toolRuntimeUi.setToolShellStatus(toolInstanceId, nextStatus);
    }
  });
  const shellActions = createWorkbenchShellActions({
    updateWorkbenchState,
    flushPersistence: flushWorkspacePersistence
  });
  const layoutActions = createWorkbenchLayoutActions({
    toolCatalog: options.toolCatalog,
    getWorkbenchState: () => get(internalWorkspaceStore),
    createWorkbenchState,
    updateWorkbenchState
  });
  const genericWorkspaceActions = createWorkbenchWorkspaceActions({
    toolCatalog: options.toolCatalog,
    initialWorkspaceMode: options.initialWorkspaceMode,
    createInitialWorkspace,
    getWorkbenchState: () => get(internalWorkspaceStore),
    createWorkbenchState,
    updateWorkbenchState,
    setWorkbenchState,
    resolveWorkspaceCommandHistoryScope
  });
  const historyActions = createWorkbenchHistoryActions({
    workspaceHistory: historyRuntime.controller,
    getWorkbenchState: () => get(internalWorkspaceStore),
    createHistorySnapshot: historyRuntime.createSnapshot,
    restoreHistorySnapshot,
    setWorkbenchState,
    syncHistoryStatus: historyRuntime.syncStatus
  });
  const windowActions = createWorkbenchWindowRuntime({
    detachedWindows: options.detachedWindows,
    createWorkbenchState,
    updateWorkbenchState,
    flushWorkspacePersistence
  });

  const unsubscribeState = internalWorkspaceStore.subscribe((state) => {
    persistenceCoordinator.handleStateChange(state);
    toolRuntimeUi.prune(state.workspace.toolInstances);
  });

  const workspaceStore = {
    subscribe: derived([internalWorkspaceStore, toolRuntimeUi.store], ([$state, $toolRuntimeUi]) => ({
      ...$state,
      toolRuntimeUi: $toolRuntimeUi
    })).subscribe
  };

  const workspaceHistoryStore = {
    subscribe: historyRuntime.statusStore.subscribe
  };

  const workspaceActions = {
    ...genericWorkspaceActions,

    ...layoutActions,

    ...windowActions,

    ...shellActions,

    ...historyActions,

    dispatchCommand(command: WorkspaceCommand): void {
      genericWorkspaceActions.dispatchCommand(command);
      // The active tab is user-visible shell state. Persist it at the interaction boundary so a
      // reload cannot reopen the default tab while the ordinary debounce is still pending.
      if (command.type === 'activate-tab' || command.type === 'focus-panel') flushWorkspacePersistence();
    },

    toolRuntime: toolRuntimeActions
  };

  function resetForTests(): void {
    if (disposed) return;
    windowActions.disposeDetachedWindowTracking();
    historyRuntime.reset();
    internalWorkspaceStore.set(createWorkbenchState());
    toolRuntimeUi.reset();
    flushWorkspacePersistence();
    historyRuntime.syncStatus();
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    unsubscribeState();
    windowActions.disposeDetachedWindowTracking();
    // Providers belong to the caller; release only this runtime's subscriptions.
    persistenceCoordinator.dispose();
  }

  return {
    dispose,
    flushPersistence: flushWorkspacePersistence,
    workspaceStore,
    workspaceHistoryStore,
    workspaceActions,
    __resetWorkspaceStoreForTests: resetForTests
  };
}
