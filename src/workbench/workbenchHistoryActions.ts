import type {
  WorkbenchHistoryChannel,
  WorkspaceHistoryController
} from './workspaceHistoryController';

export interface CreateWorkbenchHistoryActionsInput<TState, TSnapshot> {
  workspaceHistory: WorkspaceHistoryController<TSnapshot>;
  getWorkbenchState(): TState;
  createHistorySnapshot(state: TState): TSnapshot;
  restoreHistorySnapshot(snapshot: TSnapshot): TState;
  setWorkbenchState(nextState: TState, historyScope?: 'none'): void;
  syncHistoryStatus(): void;
}

export function createWorkbenchHistoryActions<TState, TSnapshot>(
  input: CreateWorkbenchHistoryActionsInput<TState, TSnapshot>
) {
  function beginTransaction(channel: WorkbenchHistoryChannel): void {
    input.workspaceHistory.beginTransaction(channel, input.createHistorySnapshot(input.getWorkbenchState()));
  }

  function commitTransaction(channel: WorkbenchHistoryChannel): void {
    input.workspaceHistory.commitTransaction(channel, input.createHistorySnapshot(input.getWorkbenchState()));
    input.syncHistoryStatus();
  }

  function cancelTransaction(channel: WorkbenchHistoryChannel): void {
    const snapshot = input.workspaceHistory.cancelTransaction(channel);

    if (!snapshot) {
      return;
    }

    input.setWorkbenchState(input.restoreHistorySnapshot(snapshot), 'none');
    input.syncHistoryStatus();
  }

  function undoHistory(channel: WorkbenchHistoryChannel): void {
    const snapshot = input.workspaceHistory.undo(channel, input.createHistorySnapshot(input.getWorkbenchState()));

    if (!snapshot) {
      return;
    }

    input.setWorkbenchState(input.restoreHistorySnapshot(snapshot), 'none');
    input.syncHistoryStatus();
  }

  function redoHistory(channel: WorkbenchHistoryChannel): void {
    const snapshot = input.workspaceHistory.redo(channel, input.createHistorySnapshot(input.getWorkbenchState()));

    if (!snapshot) {
      return;
    }

    input.setWorkbenchState(input.restoreHistorySnapshot(snapshot), 'none');
    input.syncHistoryStatus();
  }

  return {
    beginAppHistoryTransaction: () => beginTransaction('app'),
    commitAppHistoryTransaction: () => commitTransaction('app'),
    cancelAppHistoryTransaction: () => cancelTransaction('app'),
    beginCoreHistoryTransaction: () => beginTransaction('core'),
    commitCoreHistoryTransaction: () => commitTransaction('core'),
    cancelCoreHistoryTransaction: () => cancelTransaction('core'),
    undoAppHistory: () => undoHistory('app'),
    redoAppHistory: () => redoHistory('app'),
    undoCoreHistory: () => undoHistory('core'),
    redoCoreHistory: () => redoHistory('core')
  };
}
