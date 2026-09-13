import {
  createWorkspaceSessionState,
  dispatchWorkspaceCommand,
  runToolShellCommand,
  setToolPanelTitleOverride,
  updateToolState,
  type JsonObject,
  type LayoutInteractionState,
  type ShellState,
  type ToolCatalog,
  type ToolPanelLoadingState,
  type ToolResourceLoadingState,
  type ToolRuntimeHostActions,
  type ToolShellStatus,
  type Workspace,
  type WorkspaceFocus
} from '@konitif/workbench/workspace-contracts';
import type { WorkbenchHistoryScope, WorkspaceHistoryController } from './workspaceHistoryController';

export interface WorkbenchToolRuntimeState {
  workspace: Workspace;
  focus: WorkspaceFocus;
  shell: ShellState;
  layoutInteraction: LayoutInteractionState;
}

export interface CreateWorkbenchToolRuntimeActionsInput<TState extends WorkbenchToolRuntimeState, TSnapshot> {
  toolCatalog: ToolCatalog;
  workspaceHistory: WorkspaceHistoryController<TSnapshot>;
  getWorkbenchState(): TState;
  createHistorySnapshot(state: TState): TSnapshot;
  restoreHistorySnapshot(snapshot: TSnapshot): TState;
  createWorkbenchState(
    workspaceSession: ReturnType<typeof createWorkspaceSessionState>,
    shell: ShellState,
    layoutInteraction: LayoutInteractionState
  ): TState;
  updateWorkbenchState(updater: (state: TState) => TState, historyScope?: WorkbenchHistoryScope): void;
  setWorkbenchState(nextState: TState, historyScope?: WorkbenchHistoryScope): void;
  syncHistoryStatus(): void;
  setToolPanelLoadingState(toolInstanceId: string, nextLoading: ToolPanelLoadingState | null): boolean;
  setToolResourceLoadingState(toolInstanceId: string, nextLoading: ToolResourceLoadingState | null): boolean;
  setToolShellStatusState(toolInstanceId: string, nextStatus: ToolShellStatus | null): boolean;
}

export function createWorkbenchToolRuntimeActions<TState extends WorkbenchToolRuntimeState, TSnapshot>(
  input: CreateWorkbenchToolRuntimeActionsInput<TState, TSnapshot>
): ToolRuntimeHostActions {
  return {
    updateToolState(toolInstanceId: string, nextState: JsonObject): boolean {
      let didUpdate = false;

      input.updateWorkbenchState((state) => {
        const nextWorkspace = updateToolState(state.workspace, { toolInstanceId, nextState });
        didUpdate = nextWorkspace !== state.workspace;
        return didUpdate
          ? input.createWorkbenchState(
              createWorkspaceSessionState(nextWorkspace, state.focus),
              state.shell,
              state.layoutInteraction
            )
          : state;
      }, 'app');

      return didUpdate;
    },

    setToolPanelTitleOverride(panelId: string, toolInstanceId: string, nextTitle: string | null): boolean {
      let didUpdate = false;

      input.updateWorkbenchState((state) => {
        const nextWorkspace = setToolPanelTitleOverride(
          state.workspace,
          {
            panelId,
            toolInstanceId,
            panelTitleOverride: nextTitle
          },
          input.toolCatalog
        );
        didUpdate = nextWorkspace !== state.workspace;
        return didUpdate
          ? input.createWorkbenchState(
              createWorkspaceSessionState(nextWorkspace, state.focus),
              state.shell,
              state.layoutInteraction
            )
          : state;
      }, 'app');

      return didUpdate;
    },

    setToolShellStatus(toolInstanceId: string, nextStatus: ToolShellStatus | null): boolean {
      const toolInstance = input.getWorkbenchState().workspace.toolInstances[toolInstanceId];
      if (!toolInstance) return false;
      const definition = input.toolCatalog.getDefinition(toolInstance.toolId);

      // A status rendered by the Tool itself has no shell consumer. Publishing
      // it globally would invalidate every panel for a purely local projection.
      if (definition?.shell?.statusPlacement === 'tool-header') return true;

      return input.setToolShellStatusState(toolInstanceId, nextStatus);
    },

    setToolPanelLoading(toolInstanceId: string, nextLoading: ToolPanelLoadingState | null): boolean {
      return input.setToolPanelLoadingState(toolInstanceId, nextLoading);
    },

    setToolResourceLoading(toolInstanceId: string, nextLoading: ToolResourceLoadingState | null): boolean {
      return input.setToolResourceLoadingState(toolInstanceId, nextLoading);
    },

    runToolCommand(panelId: string, toolInstanceId: string, commandId: string): boolean {
      let didUpdate = false;

      input.updateWorkbenchState((state) => {
        const nextWorkspace = runToolShellCommand(
          state.workspace,
          {
            panelId,
            toolInstanceId,
            commandId
          },
          input.toolCatalog
        );
        didUpdate = nextWorkspace !== state.workspace;
        return didUpdate
          ? input.createWorkbenchState(
              createWorkspaceSessionState(nextWorkspace, state.focus),
              state.shell,
              state.layoutInteraction
            )
          : state;
      }, 'app');

      return didUpdate;
    },

    openTool(toolId: string): boolean {
      let didUpdate = false;
      input.updateWorkbenchState((state) => {
        const nextSession = dispatchWorkspaceCommand(
          state,
          { type: 'open-tool', toolId },
          { toolCatalog: input.toolCatalog }
        );
        didUpdate = nextSession.workspace !== state.workspace || nextSession.focus !== state.focus;
        return didUpdate
          ? input.createWorkbenchState(nextSession, state.shell, state.layoutInteraction)
          : state;
      }, 'app');
      return didUpdate;
    },

    canUndoHistory(): boolean {
      return input.workspaceHistory.getStatus().app.canUndo;
    },

    canRedoHistory(): boolean {
      return input.workspaceHistory.getStatus().app.canRedo;
    },

    undoHistory(): boolean {
      const snapshot = input.workspaceHistory.undo(
        'app',
        input.createHistorySnapshot(input.getWorkbenchState())
      );

      if (!snapshot) {
        return false;
      }

      input.setWorkbenchState(input.restoreHistorySnapshot(snapshot), 'none');
      input.syncHistoryStatus();
      return true;
    },

    redoHistory(): boolean {
      const snapshot = input.workspaceHistory.redo(
        'app',
        input.createHistorySnapshot(input.getWorkbenchState())
      );

      if (!snapshot) {
        return false;
      }

      input.setWorkbenchState(input.restoreHistorySnapshot(snapshot), 'none');
      input.syncHistoryStatus();
      return true;
    }
  };
}
