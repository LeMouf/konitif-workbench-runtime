import {
  createWorkspaceSessionFromPreset,
  createWorkspaceSessionState,
  dismissLayoutInteraction,
  dispatchWorkspaceCommand,
  exportWorkspaceSnapshot as serializeWorkspaceSnapshot,
  importWorkspaceSnapshot as parseWorkspaceSnapshotSource,
  setDesignSystemThemeSession,
  setWorkspaceFullscreenPanel,
  type DesignSystemThemeSession,
  type LayoutInteractionState,
  type ShellState,
  type ToolCatalog,
  type Workspace,
  type WorkspaceCommand,
  type WorkspaceFocus,
  type WorkspacePresetId,
  type WorkspacePresetArtifact,
  type WorkspaceSessionState,
  type WorkspaceSnapshotImportResult
} from '@konitif/workbench/workspace-contracts';
import type { WorkbenchHistoryScope } from './workspaceHistoryController';

export type InitialWorkbenchWorkspaceMode = 'tool' | 'empty';

export interface WorkbenchWorkspaceActionState {
  workspace: Workspace;
  focus: WorkspaceFocus;
  shell: ShellState;
  layoutInteraction: LayoutInteractionState;
}

export interface CreateWorkbenchWorkspaceActionsInput<TState extends WorkbenchWorkspaceActionState> {
  toolCatalog: ToolCatalog;
  initialWorkspaceMode?: InitialWorkbenchWorkspaceMode;
  createInitialWorkspace(mode?: InitialWorkbenchWorkspaceMode): Workspace;
  getWorkbenchState(): TState;
  createWorkbenchState(
    workspaceSession?: WorkspaceSessionState,
    shellState?: ShellState,
    layoutInteraction?: LayoutInteractionState
  ): TState;
  updateWorkbenchState(updater: (state: TState) => TState, historyScope?: WorkbenchHistoryScope): void;
  setWorkbenchState(nextState: TState, historyScope?: WorkbenchHistoryScope): void;
  resolveWorkspaceCommandHistoryScope(command: WorkspaceCommand): WorkbenchHistoryScope;
}

export function createWorkbenchWorkspaceActions<TState extends WorkbenchWorkspaceActionState>(
  input: CreateWorkbenchWorkspaceActionsInput<TState>
) {
  return {
    applyWorkspaceSession(
      workspaceSession: WorkspaceSessionState,
      historyScope: WorkbenchHistoryScope = 'both'
    ): void {
      input.updateWorkbenchState(
        (state) => input.createWorkbenchState(workspaceSession, state.shell, state.layoutInteraction),
        historyScope
      );
    },

    applyWorkspacePresetArtifact(artifact: WorkspacePresetArtifact): void {
      const workspaceSession = createWorkspaceSessionState(
        {
          ...artifact.workspaceSession.workspace,
          presetProvenance: {
            id: artifact.id,
            version: artifact.version,
            status: 'exact'
          }
        },
        artifact.workspaceSession.focus
      );
      input.setWorkbenchState(
        input.createWorkbenchState(workspaceSession, artifact.shellState),
        'both'
      );
    },

    dispatchCommand(command: WorkspaceCommand): void {
      input.updateWorkbenchState(
        (state) =>
          input.createWorkbenchState(
            dispatchWorkspaceCommand(state, command, { toolCatalog: input.toolCatalog }),
            state.shell,
            dismissLayoutInteraction()
          ),
        input.resolveWorkspaceCommandHistoryScope(command)
      );
    },

    resetWorkspace(mode: InitialWorkbenchWorkspaceMode | 'initial' = 'initial'): void {
      const workspaceMode = mode === 'initial' ? (input.initialWorkspaceMode ?? 'tool') : mode;
      input.setWorkbenchState(
        input.createWorkbenchState(createWorkspaceSessionState(input.createInitialWorkspace(workspaceMode))),
        'core'
      );
    },

    loadPreset(presetId: WorkspacePresetId): void {
      if (presetId === 'default') {
        input.setWorkbenchState(
          input.createWorkbenchState(createWorkspaceSessionState(input.createInitialWorkspace('tool'))),
          'core'
        );
        return;
      }

      input.setWorkbenchState(
        input.createWorkbenchState(createWorkspaceSessionFromPreset(input.toolCatalog, presetId)),
        'core'
      );
    },

    exportWorkspaceSnapshot(): string {
      return serializeWorkspaceSnapshot(input.getWorkbenchState().workspace);
    },

    importWorkspaceSnapshot(source: string): WorkspaceSnapshotImportResult {
      const result = parseWorkspaceSnapshotSource(source);

      if (result.ok && result.workspace) {
        const importedWorkspace = result.workspace;
        input.updateWorkbenchState(
          (state) =>
            input.createWorkbenchState(
              createWorkspaceSessionState(importedWorkspace),
              state.shell,
              dismissLayoutInteraction()
            ),
          'core'
        );
      }

      return result;
    },

    setFullscreenPanel(panelId: string | null): void {
      input.updateWorkbenchState(
        (state) =>
          input.createWorkbenchState(
            createWorkspaceSessionState(setWorkspaceFullscreenPanel(state.workspace, panelId), state.focus),
            state.shell,
            state.layoutInteraction
          ),
        'none'
      );
    },

    setDesignSystemThemeSession(nextSession: DesignSystemThemeSession | null): void {
      input.updateWorkbenchState((state) => {
        const nextWorkspace = setDesignSystemThemeSession(state.workspace, nextSession);

        return nextWorkspace === state.workspace
          ? state
          : input.createWorkbenchState(
              createWorkspaceSessionState(nextWorkspace, state.focus),
              state.shell,
              state.layoutInteraction
            );
      }, 'app');
    }
  };
}
