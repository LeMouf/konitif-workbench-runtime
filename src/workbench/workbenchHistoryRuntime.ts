import { writable } from 'svelte/store';
import type { ShellState, Workspace, WorkspaceFocus } from '@konitif/workbench/workspace-contracts';
import {
  createWorkspaceHistoryController,
  type WorkbenchHistoryScope,
  type WorkbenchHistoryStatus
} from './workspaceHistoryController';

export interface WorkbenchHistoryState {
  workspace: Workspace;
  focus: WorkspaceFocus;
  shell: ShellState;
}

export type WorkbenchSnapshot<TState extends WorkbenchHistoryState> = Pick<TState, 'workspace' | 'focus' | 'shell'>;

export function createWorkbenchHistoryRuntime<TState extends WorkbenchHistoryState>() {
  const statusStore = writable<WorkbenchHistoryStatus>({
    app: { canUndo: false, canRedo: false },
    core: { canUndo: false, canRedo: false }
  });
  const controller = createWorkspaceHistoryController<WorkbenchSnapshot<TState>>({
    isChanged(left, right) {
      return left.workspace !== right.workspace || left.focus !== right.focus || left.shell !== right.shell;
    }
  });

  function createSnapshot(state: TState): WorkbenchSnapshot<TState> {
    return {
      workspace: state.workspace,
      focus: state.focus,
      shell: state.shell
    };
  }

  function syncStatus(): void {
    statusStore.set(controller.getStatus());
  }

  function recordTransition(previousState: TState, nextState: TState, historyScope: WorkbenchHistoryScope): void {
    if (previousState === nextState || historyScope === 'none') {
      return;
    }

    controller.recordTransition(createSnapshot(previousState), createSnapshot(nextState), historyScope);
    syncStatus();
  }

  function reset(): void {
    controller.reset();
    syncStatus();
  }

  return {
    controller,
    statusStore,
    createSnapshot,
    recordTransition,
    reset,
    syncStatus
  };
}
