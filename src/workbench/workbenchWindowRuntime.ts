import type { WorkbenchDetachedWindowHost, WorkbenchDetachedWindowOpening } from './workbenchDetachedWindowHost';
import {
  createWorkspaceSessionState,
  detachPanelToWindow as detachPanelToWindowCore,
  dismissLayoutInteraction,
  getPreferredFocusedPanelId,
  reattachWorkspaceWindow,
  type LayoutInteractionState,
  type ShellState,
  type Workspace,
  type WorkspaceFocus
} from '@konitif/workbench/workspace-contracts';
import type { WorkbenchHistoryScope } from './workspaceHistoryController';

export interface WorkbenchWindowActionState {
  workspace: Workspace;
  focus: WorkspaceFocus;
  shell: ShellState;
  layoutInteraction: LayoutInteractionState;
}

export interface CreateWorkbenchWindowRuntimeInput<TState extends WorkbenchWindowActionState> {
  detachedWindows: WorkbenchDetachedWindowHost | null;
  createWorkbenchState(
    workspaceSession: ReturnType<typeof createWorkspaceSessionState>,
    shellState: ShellState,
    layoutInteraction: LayoutInteractionState
  ): TState;
  updateWorkbenchState(updater: (state: TState) => TState, historyScope?: WorkbenchHistoryScope): void;
  flushWorkspacePersistence(): void;
}

export function createWorkbenchWindowRuntime<TState extends WorkbenchWindowActionState>(
  input: CreateWorkbenchWindowRuntimeInput<TState>
) {
  if (input.detachedWindows === undefined) throw new TypeError('detachedWindows must be supplied explicitly.');
  const subscriptions = new Set<() => void>();
  function recover(target: { windowId: string; sourceWindowId: string; sourceStackId: string }): void {
    input.updateWorkbenchState((state) => {
      const workspace = reattachWorkspaceWindow(state.workspace, target);
      if (workspace === state.workspace) return state;
      return input.createWorkbenchState(
        createWorkspaceSessionState(workspace, { activePanelId: getPreferredFocusedPanelId(workspace) }),
        state.shell, dismissLayoutInteraction()
      );
    }, 'app');
    input.flushWorkspacePersistence();
  }

  function observeClosed(opening: Extract<WorkbenchDetachedWindowOpening, { status: 'opened' }>, target: { windowId: string; sourceWindowId: string; sourceStackId: string }): void {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const stop = () => {
      if (!active) return;
      active = false;
      subscriptions.delete(stop);
      unsubscribe?.();
    };
    subscriptions.add(stop);
    try {
      unsubscribe = opening.observeClosed(() => {
        if (!active) return;
        stop();
        recover(target);
      });
      // A provider may notify synchronously during subscription.
      if (!active) unsubscribe();
    } catch (error) {
      stop();
      throw error;
    }
  }

  return {
    disposeDetachedWindowTracking(): void {
      for (const stop of [...subscriptions]) stop();
    },
    detachPanelToWindow(panelId: string): string | null {
      if (input.detachedWindows === null) return null;
      let detachedWindowId: string | null = null;
      let recoveryTarget: { windowId: string; sourceWindowId: string; sourceStackId: string } | null = null;

      input.updateWorkbenchState((state) => {
        const result = detachPanelToWindowCore(state.workspace, { panelId });

        if (!result) {
          return state;
        }

        detachedWindowId = result.windowId;
        recoveryTarget = result;
        const nextFocusedPanelId =
          state.focus.activePanelId === panelId
            ? getPreferredFocusedPanelId(result.workspace)
            : state.focus.activePanelId;

        return input.createWorkbenchState(
          createWorkspaceSessionState(result.workspace, { activePanelId: nextFocusedPanelId ?? null }),
          state.shell,
          dismissLayoutInteraction()
        );
      }, 'app');

      if (detachedWindowId) {
        input.flushWorkspacePersistence();
        let opening: WorkbenchDetachedWindowOpening;
        try {
          opening = input.detachedWindows.open(detachedWindowId);
        } catch (error) {
          if (recoveryTarget) recover(recoveryTarget);
          throw error;
        }
        if (recoveryTarget && opening.status === 'blocked') {
          recover(recoveryTarget);
          detachedWindowId = null;
        }
        else if (recoveryTarget && opening.status === 'opened') observeClosed(opening, recoveryTarget);
      }

      return detachedWindowId;
    }
  };
}
