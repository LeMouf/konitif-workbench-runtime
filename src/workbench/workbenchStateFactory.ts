import {
  createLayoutInteractionState,
  createShellState,
  createWorkspace,
  createWorkspaceSessionState,
  normalizeWorkspaceFullscreenPanel,
  type LayoutInteractionState,
  type ShellRegionId,
  type ShellState,
  type ShellWidgetCatalog,
  type ToolCatalog,
  type Workspace,
  type WorkspaceSessionState
} from '@konitif/workbench/workspace-contracts';
import type { InitialWorkbenchWorkspaceMode } from './workbenchWorkspaceActions';

export interface WorkbenchState {
  workspace: WorkspaceSessionState['workspace'];
  focus: WorkspaceSessionState['focus'];
  shell: ShellState;
  layoutInteraction: LayoutInteractionState;
}

export interface CreateWorkbenchStateFactoryInput {
  initialToolId: string;
  toolCatalog: ToolCatalog;
  shellWidgetCatalog: ShellWidgetCatalog;
  initialWorkspaceMode?: InitialWorkbenchWorkspaceMode;
  initialStackHeaderVisible?: boolean;
  defaultOpenShellRegions?: ShellRegionId[];
}

export interface WorkbenchStateFactory {
  createInitialWorkspace(mode?: InitialWorkbenchWorkspaceMode): Workspace;
  createShellFallback(): ShellState;
  createWorkbenchState(
    workspaceSession?: WorkspaceSessionState,
    shellState?: ShellState,
    layoutInteraction?: LayoutInteractionState
  ): WorkbenchState;
}

export function createWorkbenchStateFactory(
  input: CreateWorkbenchStateFactoryInput
): WorkbenchStateFactory {
  function createInitialWorkspace(mode: InitialWorkbenchWorkspaceMode = input.initialWorkspaceMode ?? 'tool'): Workspace {
    const workspace = mode === 'empty'
      ? createWorkspace()
      : createWorkspace(input.toolCatalog, { initialToolId: input.initialToolId });

    return applyInitialWorkspacePreferences(workspace);
  }

  function createShellFallback(): ShellState {
    return createShellState(input.shellWidgetCatalog, { openRegionIds: input.defaultOpenShellRegions });
  }

  function createWorkbenchState(
    workspaceSession = createWorkspaceSessionState(createInitialWorkspace()),
    shellState = createShellFallback(),
    layoutInteraction = createLayoutInteractionState()
  ): WorkbenchState {
    const normalizedWorkspace = normalizeWorkspaceFullscreenPanel(workspaceSession.workspace);
    const normalizedSession = createWorkspaceSessionState(normalizedWorkspace, workspaceSession.focus);

    return {
      workspace: normalizedSession.workspace,
      focus: normalizedSession.focus,
      shell: shellState,
      layoutInteraction
    };
  }

  function applyInitialWorkspacePreferences(workspace: Workspace): Workspace {
    if (typeof input.initialStackHeaderVisible !== 'boolean') {
      return workspace;
    }

    return {
      ...workspace,
      windows: workspace.windows.map((window) => {
        if (window.id !== workspace.activeWindowId || window.root.kind !== 'stack') {
          return window;
        }

        return {
          ...window,
          root: {
            ...window.root,
            headerVisible: input.initialStackHeaderVisible
          }
        };
      })
    };
  }

  return {
    createInitialWorkspace,
    createShellFallback,
    createWorkbenchState
  };
}
