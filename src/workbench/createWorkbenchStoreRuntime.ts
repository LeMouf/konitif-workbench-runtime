import {createWorkbenchInitializationObservation,type WorkbenchInitializationObserver} from './workbenchInitializationObservation';
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
  /** Optional read-only initialization notifications; observer failures are isolated. */
  initializationObserver?:WorkbenchInitializationObserver;
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
  const observation=createWorkbenchInitializationObservation(options.initializationObserver),initializationSource='src/workbench/createWorkbenchStoreRuntime.ts';
  observation.measure({key:"initial.validate-ports",label:"Validate required runtime ports",kind:"operation",source:initializationSource},()=>{
  for (const key of ['workspacePersistence', 'shellPersistence', 'focusPersistence', 'workspaceSync', 'hostEvents', 'detachedWindows'] as const) {
    if (options[key] === undefined || (key !== 'hostEvents' && key !== 'detachedWindows' && options[key] === null)) {
      throw new TypeError(`Missing required Workbench port: ${key}`);
    }
  }
  });
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
  const stateFactory = observation.measure({key:"initial.state-factory",label:"Create Workbench state factory",kind:"construction",source:initializationSource,subject:"Workbench state factory",inputs:[{reference:options.toolCatalog,label:"Tool catalog"},{reference:options.shellWidgetCatalog,label:"Shell widget catalog"}]},()=>(createWorkbenchStateFactory({
    initialToolId: options.initialToolId,
    toolCatalog: options.toolCatalog,
    shellWidgetCatalog: options.shellWidgetCatalog,
    initialWorkspaceMode: options.initialWorkspaceMode,
    initialStackHeaderVisible: options.initialStackHeaderVisible,
    defaultOpenShellRegions: options.defaultOpenShellRegions
  })));
  const { createInitialWorkspace, createShellFallback, createWorkbenchState } = stateFactory;

  const initialWorkspace = observation.measure({key:"initial.workspace",label:"Prepare initial workspace",kind:"read",source:initializationSource,dependsOn:["initial.state-factory"]},()=>(options.coherentPersistence?.initialState.workspace ?? (isPersistenceEnabled()
    ? (observation.measure({key:"initial.workspace-load",label:"Read persisted workspace",kind:"read",source:initializationSource,inputs:[{reference:persistence,label:"Workspace persistence provider"}]},()=>persistence.load()) ?? observation.measure({key:"initial.workspace-fallback",label:"Create default workspace",kind:"construction",source:initializationSource,subject:"Default workspace",inputs:[{reference:stateFactory,label:"Workbench state factory"}]},()=>createWorkbenchState().workspace))
    : observation.measure({key:"initial.workspace-fallback",label:"Create default workspace",kind:"construction",source:initializationSource,subject:"Default workspace",inputs:[{reference:stateFactory,label:"Workbench state factory"}]},()=>createWorkbenchState().workspace))));
  const initialShell = observation.measure({key:"initial.shell",label:"Read and normalize shell preferences",kind:"read",source:initializationSource,inputs:[{reference:shellPersistence,label:"Shell persistence provider"}]},()=>(options.coherentPersistence?.initialState.shell ?? shellPersistence.load(observation.measure({key:"initial.shell-fallback",label:"Create default shell regions",kind:"construction",source:initializationSource,subject:"Default shell regions",inputs:[{reference:stateFactory,label:"Workbench state factory"}]},()=>createShellFallback()))));
  const fallbackSession = observation.measure({key:"initial.focus-fallback",label:"Create fallback workspace focus",kind:"construction",source:initializationSource,subject:"Fallback workspace session",dependsOn:["initial.workspace"],inputs:[{reference:initialWorkspace,label:"Initial workspace"}]},()=>(createWorkspaceSessionState(initialWorkspace)));
  const initialFocus = observation.measure({key:"initial.focus",label:"Read and normalize workspace focus",kind:"read",source:initializationSource,dependsOn:["initial.workspace", "initial.focus-fallback"],inputs:[{reference:focusPersistence,label:"Focus persistence provider"}]},()=>(options.coherentPersistence?.initialState.focus ?? focusPersistence.load(initialWorkspace, fallbackSession.focus)));
  const internalWorkspaceStore = observation.measure({key:"initial.workspace-store",label:"Create reactive workspace store",kind:"construction",source:initializationSource,subject:"Reactive workspace store",dependsOn:["initial.workspace", "initial.shell", "initial.focus"]},()=>(writable(
    observation.measure({key:"initial.normalize",label:"Normalize initial Workbench state",kind:"construction",source:initializationSource,subject:"Initial Workbench state",dependsOn:["initial.workspace", "initial.shell", "initial.focus"],inputs:[{reference:initialWorkspace,label:"Initial workspace"},{reference:initialShell,label:"Initial shell regions"},{reference:initialFocus,label:"Initial workspace focus"}]},()=>createWorkbenchState(createWorkspaceSessionState(initialWorkspace, initialFocus), initialShell))
  )));
  const toolRuntimeUi = observation.measure({key:"initial.tool-ui",label:"Create Tool loading state store",kind:"construction",source:initializationSource,subject:"Tool loading state store",dependsOn:["initial.workspace-store"]},()=>(createWorkbenchToolRuntimeUiStore(() => get(internalWorkspaceStore).workspace)));
  const historyRuntime = observation.measure({key:"initial.history",label:"Create workspace history runtime",kind:"construction",source:initializationSource,subject:"Workspace history runtime"},()=>(createWorkbenchHistoryRuntime<WorkbenchState>()));

  const persistenceCoordinator = observation.measure({key:"initial.persistence",label:"Resolve persistence coordinator",kind:options.coherentPersistence?.coordinator?"read":"construction",source:initializationSource,subject:"Persistence coordinator",dependsOn:["initial.workspace", "initial.shell", "initial.focus", "initial.workspace-store"],inputs:[{reference:persistence,label:"Workspace persistence provider"},{reference:shellPersistence,label:"Shell persistence provider"},{reference:focusPersistence,label:"Focus persistence provider"},{reference:workspaceSync,label:"Workspace synchronization provider"}]},()=>(options.coherentPersistence?.coordinator ?? createWorkbenchPersistenceRuntime({
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
  })));

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

  const toolRuntimeActions = observation.measure({key:"initial.actions.tools",label:"Create Tool commands",kind:"construction",source:initializationSource,subject:"Tool commands",dependsOn:["initial.workspace-store", "initial.history", "initial.tool-ui"]},()=>(createWorkbenchToolRuntimeActions({
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
  })));
  const shellActions = observation.measure({key:"initial.actions.shell",label:"Create shell commands",kind:"construction",source:initializationSource,subject:"Shell commands",dependsOn:["initial.workspace-store", "initial.persistence"]},()=>(createWorkbenchShellActions({
    updateWorkbenchState,
    flushPersistence: flushWorkspacePersistence
  })));
  const layoutActions = observation.measure({key:"initial.actions.layout",label:"Create layout commands",kind:"construction",source:initializationSource,subject:"Layout commands",dependsOn:["initial.workspace-store"]},()=>(createWorkbenchLayoutActions({
    toolCatalog: options.toolCatalog,
    getWorkbenchState: () => get(internalWorkspaceStore),
    createWorkbenchState,
    updateWorkbenchState
  })));
  const genericWorkspaceActions = observation.measure({key:"initial.actions.workspace",label:"Create workspace commands",kind:"construction",source:initializationSource,subject:"Workspace commands",dependsOn:["initial.workspace-store"]},()=>(createWorkbenchWorkspaceActions({
    toolCatalog: options.toolCatalog,
    initialWorkspaceMode: options.initialWorkspaceMode,
    createInitialWorkspace,
    getWorkbenchState: () => get(internalWorkspaceStore),
    createWorkbenchState,
    updateWorkbenchState,
    setWorkbenchState,
    resolveWorkspaceCommandHistoryScope
  })));
  const historyActions = observation.measure({key:"initial.actions.history",label:"Create history commands",kind:"construction",source:initializationSource,subject:"History commands",dependsOn:["initial.workspace-store", "initial.history"]},()=>(createWorkbenchHistoryActions({
    workspaceHistory: historyRuntime.controller,
    getWorkbenchState: () => get(internalWorkspaceStore),
    createHistorySnapshot: historyRuntime.createSnapshot,
    restoreHistorySnapshot,
    setWorkbenchState,
    syncHistoryStatus: historyRuntime.syncStatus
  })));
  const windowActions = observation.measure({key:"initial.actions.windows",label:"Create window commands",kind:"construction",source:initializationSource,subject:"Window commands",dependsOn:["initial.workspace-store", "initial.persistence"]},()=>(createWorkbenchWindowRuntime({
    detachedWindows: options.detachedWindows,
    createWorkbenchState,
    updateWorkbenchState,
    flushWorkspacePersistence
  })));

  const unsubscribeState = observation.measure({key:"initial.subscribe",label:"Connect state to persistence",kind:"operation",source:initializationSource,dependsOn:["initial.workspace-store", "initial.persistence", "initial.tool-ui"]},()=>(internalWorkspaceStore.subscribe((state) => {
    persistenceCoordinator.handleStateChange(state);
    toolRuntimeUi.prune(state.workspace.toolInstances);
  })));

  const workspaceStore = observation.measure({key:"initial.workspace-projection",label:"Create workspace reading projection",kind:"construction",source:initializationSource,subject:"Workspace reading projection",dependsOn:["initial.workspace-store", "initial.tool-ui"]},()=>({
    subscribe: derived([internalWorkspaceStore, toolRuntimeUi.store], ([$state, $toolRuntimeUi]) => ({
      ...$state,
      toolRuntimeUi: $toolRuntimeUi
    })).subscribe
  }));

  const workspaceHistoryStore = observation.measure({key:"initial.history-projection",label:"Create history reading projection",kind:"construction",source:initializationSource,subject:"History reading projection",dependsOn:["initial.history"]},()=>({
    subscribe: historyRuntime.statusStore.subscribe
  }));

  const workspaceActions = observation.measure({key:"initial.actions",label:"Compose Workbench command ports",kind:"construction",source:initializationSource,subject:"Workbench command ports",dependsOn:["initial.actions.tools", "initial.actions.shell", "initial.actions.layout", "initial.actions.workspace", "initial.actions.history", "initial.actions.windows"]},()=>({
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
  }));

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
