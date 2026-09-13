import {
  createShellState,
  createWorkspaceSessionState,
  validateWorkspace,
  type ShellRegionId,
  type ShellState,
  type ShellWidgetCatalog,
  type Workspace,
  type WorkspaceFocus,
  type WorkspacePersistencePort
} from '@konitif/workbench/workspace-contracts';
import type { WorkbenchShellPersistencePort } from './workbenchShellPersistence';
import type { WorkbenchFocusPersistencePort } from './workbenchFocusPersistence';
import type { WorkbenchHistoryScope } from './workspaceHistoryController';
import type { WorkspaceSyncController } from './workspaceSyncController';
import type { WorkbenchHostEvents, WorkbenchHostStorageChange } from './workbenchHostEvents';

export interface WorkbenchPersistenceState {
  workspace: Workspace;
  focus: WorkspaceFocus;
  shell: ShellState;
}

export interface CreateWorkbenchPersistenceRuntimeInput<TState extends WorkbenchPersistenceState> {
  persistenceKey: string;
  shellPersistenceKey: string;
  focusPersistenceKey: string;
  persistenceDebounceMs: number;
  shellWidgetCatalog: ShellWidgetCatalog;
  defaultOpenShellRegions?: ShellRegionId[];
  initialWorkspace: Workspace;
  initialShell: ShellState;
  initialFocus: WorkspaceFocus;
  workspacePersistence: WorkspacePersistencePort;
  shellPersistence: WorkbenchShellPersistencePort;
  focusPersistence: WorkbenchFocusPersistencePort;
  workspaceSync: WorkspaceSyncController;
  /** The caller selects its host; null explicitly disables notifications. */
  hostEvents: WorkbenchHostEvents | null;
  isPersistenceEnabled(): boolean;
  getWorkbenchState(): TState;
  createWorkbenchState(workspaceSession: ReturnType<typeof createWorkspaceSessionState>, shellState: ShellState): TState;
  setWorkbenchState(nextState: TState, historyScope?: WorkbenchHistoryScope): void;
}

export interface WorkbenchPersistenceCoordinator<TState extends WorkbenchPersistenceState> {
  handleStateChange(state: TState): void;
  flush(): void;
  /** Cancel pending work; call flush explicitly beforehand if desired. */
  dispose(): void;
}

export function createWorkbenchPersistenceRuntime<TState extends WorkbenchPersistenceState>(
  input: CreateWorkbenchPersistenceRuntimeInput<TState>
): WorkbenchPersistenceCoordinator<TState> {
  if (input.hostEvents === undefined) {
    throw new TypeError('hostEvents must be supplied explicitly (use null to disable notifications).');
  }
  let pendingPersistenceTimer: ReturnType<typeof setTimeout> | null = null;
  let lastPersistedWorkspace = input.initialWorkspace;
  let lastPersistedShellSignature = input.shellPersistence.serialize(input.initialShell);
  let lastPersistedFocusSignature = input.focusPersistence.serialize(input.initialFocus);
  let isApplyingRemoteWorkspace = false;
  let disposed = false;

  function createShellFallback(): ShellState {
    return createShellState(input.shellWidgetCatalog, { openRegionIds: input.defaultOpenShellRegions });
  }

  function handleStateChange(state: TState): void {
    if (disposed) return;
    scheduleWorkspacePersistence(state.workspace, state.shell, state.focus);
    publishWorkspaceSync(state.workspace, state.shell, state.focus);
  }

  function scheduleWorkspacePersistence(workspace: Workspace, shell: ShellState, focus: WorkspaceFocus): void {
    const shellSignature = input.shellPersistence.serialize(shell);
    const focusSignature = input.focusPersistence.serialize(focus);

    if (!input.isPersistenceEnabled()) {
      clearPendingPersistence();
      return;
    }

    if (
      workspace === lastPersistedWorkspace &&
      shellSignature === lastPersistedShellSignature &&
      focusSignature === lastPersistedFocusSignature
    ) {
      return;
    }

    clearPendingPersistence();

    const persist = () => {
      pendingPersistenceTimer = null;
      if (disposed) return;
      persistWorkspaceShellAndFocus(workspace, shell, shellSignature, focus, focusSignature);
    };

    if (input.persistenceDebounceMs === 0) {
      persist();
      return;
    }

    pendingPersistenceTimer = setTimeout(persist, input.persistenceDebounceMs);
  }

  function flush(): void {
    if (disposed) return;
    clearPendingPersistence();

    if (!input.isPersistenceEnabled()) {
      return;
    }

    const currentState = input.getWorkbenchState();
    persistWorkspaceShellAndFocus(
      currentState.workspace,
      currentState.shell,
      input.shellPersistence.serialize(currentState.shell),
      currentState.focus,
      input.focusPersistence.serialize(currentState.focus)
    );
  }

  function persistWorkspaceShellAndFocus(
    workspace: Workspace,
    shell: ShellState,
    shellSignature: string,
    focus: WorkspaceFocus,
    focusSignature: string
  ): void {
    if (validateWorkspace(workspace).length === 0) {
      try {
        input.workspacePersistence.save(workspace);
        lastPersistedWorkspace = workspace;
      } catch {
        // Persistence is best-effort: invalid storage state should not break runtime flows.
      }
    }

    try {
      input.shellPersistence.save(shell);
      lastPersistedShellSignature = shellSignature;
    } catch {
      // Persistence is best-effort: invalid storage state should not break runtime flows.
    }

    try {
      input.focusPersistence.save(focus);
      lastPersistedFocusSignature = focusSignature;
    } catch {
      // Persistence is best-effort: invalid storage state should not break runtime flows.
    }
  }

  function publishWorkspaceSync(workspace: Workspace, shell: ShellState, focus: WorkspaceFocus): void {
    if (!input.isPersistenceEnabled() || isApplyingRemoteWorkspace || validateWorkspace(workspace).length > 0) {
      return;
    }

    input.workspaceSync.publish({
      workspace,
      shell,
      focus
    });
  }

  function applyRemoteWorkspace(
    workspace: Workspace,
    shell: ShellState | null = null,
    focus: WorkspaceFocus | null = null
  ): void {
    if (disposed || !input.isPersistenceEnabled() || validateWorkspace(workspace).length > 0) {
      return;
    }

    const currentState = input.getWorkbenchState();
    const nextShell = shell
      ? input.shellPersistence.normalize(shell, createShellFallback())
      : currentState.shell;
    const nextShellSignature = input.shellPersistence.serialize(nextShell);
    const nextFocus = input.focusPersistence.normalize(focus, workspace, currentState.focus);
    const nextFocusSignature = input.focusPersistence.serialize(nextFocus);

    if (
      JSON.stringify(currentState.workspace) === JSON.stringify(workspace) &&
      input.shellPersistence.serialize(currentState.shell) === nextShellSignature &&
      input.focusPersistence.serialize(currentState.focus) === nextFocusSignature
    ) {
      return;
    }

    // The admitted remote snapshot supersedes the local snapshot captured by
    // the debounce callback. Do not let that stale callback overwrite storage.
    clearPendingPersistence();
    isApplyingRemoteWorkspace = true;
    lastPersistedWorkspace = workspace;
    lastPersistedShellSignature = nextShellSignature;
    lastPersistedFocusSignature = nextFocusSignature;
    input.setWorkbenchState(
      input.createWorkbenchState(createWorkspaceSessionState(workspace, nextFocus), nextShell),
      'none'
    );
    isApplyingRemoteWorkspace = false;
  }

  function clearPendingPersistence(): void {
    if (pendingPersistenceTimer !== null) {
      clearTimeout(pendingPersistenceTimer);
      pendingPersistenceTimer = null;
    }
  }

  function handlePersistenceBoundary(): void {
    flush();
  }

  function handleStorage(event: WorkbenchHostStorageChange): void {
    if (disposed || !input.isPersistenceEnabled()) {
      return;
    }

    if (
      ![input.persistenceKey, input.shellPersistenceKey, input.focusPersistenceKey].includes(event.key ?? '') ||
      !event.newValue
    ) {
      return;
    }

    const loadedWorkspace =
      event.key === input.persistenceKey
        ? input.workspacePersistence.load()
        : input.getWorkbenchState().workspace;

    if (!loadedWorkspace) {
      return;
    }

    applyRemoteWorkspace(
      loadedWorkspace,
      input.shellPersistence.load(createShellFallback()),
      input.focusPersistence.load(loadedWorkspace, input.getWorkbenchState().focus)
    );
  }
  const unsubscribeHost = input.hostEvents?.subscribe({
    onPersistenceBoundary: handlePersistenceBoundary,
    onStorageChange: handleStorage
  });

  const unsubscribe = input.workspaceSync.subscribe((snapshot) => {
    applyRemoteWorkspace(snapshot.workspace, snapshot.shell ?? null, snapshot.focus ?? null);
  });

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    clearPendingPersistence();
    try {
      unsubscribeHost?.();
    } finally {
      if (typeof unsubscribe === 'function') unsubscribe();
    }
    // workspaceSync is injected: its owner, not this subscriber, closes it.
  }

  return {
    handleStateChange,
    flush,
    dispose
  };
}
