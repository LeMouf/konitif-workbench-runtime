import {
  adjustLayoutSplitPreviewCuts,
  commitBoundaryPull,
  commitIntersectionResize,
  commitLayoutSplitPreview,
  commitLayoutSubdivideSelection,
  commitPanelDock,
  collapseSplit,
  collapseSplitBoundary,
  confirmLayoutSplitSide,
  createPeripheralBands,
  createWorkspaceSessionState,
  dismissLayoutInteraction,
  dispatchWorkspaceCommand,
  dockPanel,
  findPanelInWorkspace,
  getPreferredFocusedPanelId,
  joinPanelArea,
  openLayoutSplitMenu,
  previewLayoutSplitSide,
  resizeSplit,
  resizeSplitBoundary,
  selectLayoutMenuAction,
  selectLayoutSplitOrientation,
  startBoundaryPull,
  startIntersectionResize,
  startLayoutSplitPreview,
  startPanelDrag,
  subdividePanel,
  swapPanelArea,
  updateBoundaryPull,
  updateIntersectionResize,
  updateLayoutSplitPreview,
  updatePanelDrag,
  type LayoutDockSide,
  type LayoutDockTarget,
  type LayoutEdge,
  type LayoutInteractionResolution,
  type LayoutInteractionState,
  type LayoutMenuActionId,
  type LayoutMenuActionSelection,
  type LayoutMenuTarget,
  type ShellState,
  type SplitOrientation,
  type ToolCatalog,
  type Workspace,
  type WorkspaceFocus
} from '@konitif/workbench/workspace-contracts';
import type { WorkbenchHistoryScope } from './workspaceHistoryController';

export interface WorkbenchLayoutActionState {
  workspace: Workspace;
  focus: WorkspaceFocus;
  shell: ShellState;
  layoutInteraction: LayoutInteractionState;
}

export interface CreateWorkbenchLayoutActionsInput<TState extends WorkbenchLayoutActionState> {
  toolCatalog: ToolCatalog;
  getWorkbenchState(): TState;
  createWorkbenchState(
    workspaceSession: ReturnType<typeof createWorkspaceSessionState>,
    shell: ShellState,
    layoutInteraction: LayoutInteractionState
  ): TState;
  updateWorkbenchState(updater: (state: TState) => TState, historyScope?: WorkbenchHistoryScope): void;
}

export function createWorkbenchLayoutActions<TState extends WorkbenchLayoutActionState>(
  input: CreateWorkbenchLayoutActionsInput<TState>
) {
  function resolveLayoutMenuHistoryScope(state: WorkbenchLayoutActionState): WorkbenchHistoryScope {
    if (state.layoutInteraction.mode === 'split-menu') {
      return state.layoutInteraction.source === 'panel-menu' ? 'app' : 'core';
    }

    if (state.layoutInteraction.mode === 'split-side-pick' || state.layoutInteraction.mode === 'split-preview') {
      return state.layoutInteraction.panelId ? 'app' : 'core';
    }

    return 'core';
  }

  function applyLayoutInteractionResolution(
    state: TState,
    resolution: LayoutInteractionResolution
  ): TState {
    if (resolution.kind === 'state') {
      return {
        ...state,
        layoutInteraction: resolution.state
      };
    }

    if (resolution.kind === 'commit-subdivide') {
      const result = subdividePanel(state.workspace, resolution.subdivide);
      const nextFocusedPanelId =
        resolution.subdivide.edge === 'left' || resolution.subdivide.edge === 'top'
          ? result.createdPanelIds[0] ?? state.focus.activePanelId
          : result.createdPanelIds[result.createdPanelIds.length - 1] ?? state.focus.activePanelId;

      return input.createWorkbenchState(
        createWorkspaceSessionState(result.workspace, { activePanelId: nextFocusedPanelId ?? null }),
        state.shell,
        resolution.state
      );
    }

    if (resolution.kind === 'commit-boundary-pull') {
      const result = createPeripheralBands(state.workspace, resolution.boundaryPull);
      const nextFocusedPanelId = result.createdPanelIds[result.createdPanelIds.length - 1] ?? state.focus.activePanelId;

      return input.createWorkbenchState(
        createWorkspaceSessionState(result.workspace, { activePanelId: nextFocusedPanelId ?? null }),
        state.shell,
        resolution.state
      );
    }

    if (resolution.kind === 'commit-intersection-resize') {
      const nextWorkspace = resizeSplit(
        resizeSplit(state.workspace, {
          splitId: resolution.intersectionResize.columnSplitId,
          sizes: resolution.intersectionResize.columnSizes
        }),
        {
          splitId: resolution.intersectionResize.rowSplitId,
          sizes: resolution.intersectionResize.rowSizes
        }
      );

      return input.createWorkbenchState(
        createWorkspaceSessionState(nextWorkspace, state.focus),
        state.shell,
        resolution.state
      );
    }

    if (resolution.kind === 'commit-swap') {
      return input.createWorkbenchState(
        createWorkspaceSessionState(swapPanelArea(state.workspace, resolution.swap), state.focus),
        state.shell,
        resolution.state
      );
    }

    if (resolution.kind === 'commit-join') {
      const nextWorkspace = joinPanelArea(state.workspace, resolution.join);
      const nextFocusedPanelId =
        resolution.join.siblingAreaPanelIds.find((panelId) => findPanelInWorkspace(nextWorkspace, panelId)) ??
        (findPanelInWorkspace(nextWorkspace, state.focus.activePanelId ?? '')
          ? state.focus.activePanelId
          : getPreferredFocusedPanelId(nextWorkspace));

      return input.createWorkbenchState(
        createWorkspaceSessionState(nextWorkspace, { activePanelId: nextFocusedPanelId ?? null }),
        state.shell,
        resolution.state
      );
    }

    if (resolution.kind === 'commit-dock') {
      const nextWorkspace = dockPanel(state.workspace, resolution.dock);

      return input.createWorkbenchState(
        createWorkspaceSessionState(nextWorkspace, { activePanelId: resolution.dock.panelId }),
        state.shell,
        resolution.state
      );
    }

    return input.createWorkbenchState(
      dispatchWorkspaceCommand(
        state,
        {
          type: 'split-panel-to-side',
          orientation: resolution.split.orientation,
          side: resolution.split.side,
          panelId: resolution.split.panelId ?? undefined
        },
        { toolCatalog: input.toolCatalog }
      ),
      state.shell,
      resolution.state
    );
  }

  return {
    resizeSplit(splitId: string, sizes: [number, number]): void {
      input.updateWorkbenchState((state) =>
        input.createWorkbenchState(
          createWorkspaceSessionState(resizeSplit(state.workspace, { splitId, sizes }), state.focus),
          state.shell,
          state.layoutInteraction
        ),
        'core'
      );
    },

    resizeSplitBoundary(
      rootSplitId: string,
      boundaryIndex: number,
      deltaRatio: number,
      mode: 'local' | 'proportional' = 'local'
    ): void {
      input.updateWorkbenchState((state) =>
        input.createWorkbenchState(
          createWorkspaceSessionState(
            resizeSplitBoundary(state.workspace, { rootSplitId, boundaryIndex, deltaRatio, mode }),
            state.focus
          ),
          state.shell,
          state.layoutInteraction
        ),
        'core'
      );
    },

    collapseSplit(splitId: string, removeChildIndex: 0 | 1): void {
      input.updateWorkbenchState((state) => {
        const nextWorkspace = collapseSplit(state.workspace, { splitId, removeChildIndex });
        const nextFocusedPanelId =
          findPanelInWorkspace(nextWorkspace, state.focus.activePanelId ?? '')
            ? state.focus.activePanelId
            : getPreferredFocusedPanelId(nextWorkspace);

        return input.createWorkbenchState(
          createWorkspaceSessionState(nextWorkspace, { activePanelId: nextFocusedPanelId ?? null }),
          state.shell,
          state.layoutInteraction
        );
      }, 'core');
    },

    collapseSplitBoundary(rootSplitId: string, boundaryIndex: number, removeSide: 'start' | 'end'): void {
      input.updateWorkbenchState((state) => {
        const nextWorkspace = collapseSplitBoundary(state.workspace, { rootSplitId, boundaryIndex, removeSide });
        const nextFocusedPanelId =
          findPanelInWorkspace(nextWorkspace, state.focus.activePanelId ?? '')
            ? state.focus.activePanelId
            : getPreferredFocusedPanelId(nextWorkspace);

        return input.createWorkbenchState(
          createWorkspaceSessionState(nextWorkspace, { activePanelId: nextFocusedPanelId ?? null }),
          state.shell,
          state.layoutInteraction
        );
      }, 'core');
    },

    openLayoutSplitMenu(
      panelId: string | null,
      edge: LayoutEdge,
      anchor: { x: number; y: number },
      targets: LayoutMenuTarget[] = [],
      options: {
        source?: 'workspace-edge' | 'split-boundary' | 'panel-menu';
        initialActionId?: LayoutMenuActionId | null;
      } = {}
    ): void {
      input.updateWorkbenchState((state) => ({
        ...state,
        layoutInteraction: openLayoutSplitMenu(panelId, edge, anchor, targets, options)
      }));
    },

    selectLayoutSplitOrientation(orientation: SplitOrientation): void {
      input.updateWorkbenchState(
        (state) =>
          applyLayoutInteractionResolution(
            state,
            selectLayoutSplitOrientation(state.layoutInteraction, orientation)
          ),
        resolveLayoutMenuHistoryScope(input.getWorkbenchState())
      );
    },

    selectLayoutMenuAction(selection: LayoutMenuActionSelection | null): void {
      input.updateWorkbenchState(
        (state) => applyLayoutInteractionResolution(state, selectLayoutMenuAction(state.layoutInteraction, selection)),
        resolveLayoutMenuHistoryScope(input.getWorkbenchState())
      );
    },

    hoverLayoutSplitSide(side: LayoutDockSide | null): void {
      input.updateWorkbenchState((state) => ({
        ...state,
        layoutInteraction: previewLayoutSplitSide(state.layoutInteraction, side)
      }));
    },

    confirmLayoutSplitSide(side: LayoutDockSide): void {
      input.updateWorkbenchState(
        (state) => applyLayoutInteractionResolution(state, confirmLayoutSplitSide(state.layoutInteraction, side)),
        resolveLayoutMenuHistoryScope(input.getWorkbenchState())
      );
    },

    updateLayoutSplitPreview(panelId: string | null, pointerRatio: number): void {
      input.updateWorkbenchState((state) => ({
        ...state,
        layoutInteraction: updateLayoutSplitPreview(state.layoutInteraction, panelId, pointerRatio)
      }));
    },

    adjustLayoutSplitPreviewCuts(delta: number): void {
      input.updateWorkbenchState((state) => ({
        ...state,
        layoutInteraction: adjustLayoutSplitPreviewCuts(state.layoutInteraction, delta)
      }));
    },

    startLayoutSplitPreview(
      panelId: string,
      edge: LayoutEdge,
      orientation: SplitOrientation,
      cuts: number,
      pointerRatio: number
    ): void {
      input.updateWorkbenchState((state) => ({
        ...state,
        layoutInteraction: startLayoutSplitPreview({
          panelId,
          edge,
          orientation,
          cuts,
          pointerRatio
        })
      }));
    },

    startBoundaryPull(params: {
      windowId?: string;
      anchor: { x: number; y: number };
      horizontalEdge?: 'left' | 'right' | null;
      verticalEdge?: 'top' | 'bottom' | null;
      source?: 'edge' | 'corner';
      neutralThreshold?: number;
      creationThreshold?: number;
    }): void {
      input.updateWorkbenchState((state) => ({
        ...state,
        layoutInteraction: startBoundaryPull({ ...params, windowId: params.windowId ?? state.workspace.activeWindowId })
      }));
    },

    updateBoundaryPull(pointer: { x: number; y: number }, viewport: { width: number; height: number }): void {
      input.updateWorkbenchState((state) => ({
        ...state,
        layoutInteraction: updateBoundaryPull(state.layoutInteraction, pointer, viewport)
      }));
    },

    commitBoundaryPull(): void {
      input.updateWorkbenchState(
        (state) => applyLayoutInteractionResolution(state, commitBoundaryPull(state.layoutInteraction)),
        'core'
      );
    },

    startIntersectionResize(params: {
      anchor: { x: number; y: number };
      columnSplitId: string;
      rowSplitId: string;
      columnBaseSizes: [number, number];
      rowBaseSizes: [number, number];
    }): void {
      input.updateWorkbenchState((state) => ({
        ...state,
        layoutInteraction: startIntersectionResize(params)
      }));
    },

    updateIntersectionResize(pointer: { x: number; y: number }, dimensions: { width: number; height: number }): void {
      input.updateWorkbenchState((state) => ({
        ...state,
        layoutInteraction: updateIntersectionResize(state.layoutInteraction, pointer, dimensions)
      }));
    },

    commitIntersectionResize(): void {
      input.updateWorkbenchState(
        (state) => applyLayoutInteractionResolution(state, commitIntersectionResize(state.layoutInteraction)),
        'core'
      );
    },

    startPanelDrag(panelId: string, sourceStackId: string, anchor: { x: number; y: number }): void {
      input.updateWorkbenchState((state) => ({
        ...state,
        layoutInteraction: startPanelDrag(panelId, sourceStackId, anchor)
      }));
    },

    updatePanelDrag(pointer: { x: number; y: number }, hoveredTarget: LayoutDockTarget | null): void {
      input.updateWorkbenchState((state) => ({
        ...state,
        layoutInteraction: updatePanelDrag(state.layoutInteraction, pointer, hoveredTarget)
      }));
    },

    commitPanelDock(): void {
      input.updateWorkbenchState(
        (state) => applyLayoutInteractionResolution(state, commitPanelDock(state.layoutInteraction)),
        'app'
      );
    },

    commitLayoutSubdivideSelection(
      panelId: string,
      edge: LayoutEdge,
      orientation: SplitOrientation,
      cuts: number,
      pointerRatio: number
    ): void {
      input.updateWorkbenchState((state) =>
        applyLayoutInteractionResolution(
          state,
          commitLayoutSubdivideSelection({ panelId, edge, orientation, cuts, pointerRatio })
        ),
        panelId ? 'app' : 'core'
      );
    },

    commitLayoutSplitPreview(): void {
      input.updateWorkbenchState(
        (state) => applyLayoutInteractionResolution(state, commitLayoutSplitPreview(state.layoutInteraction)),
        resolveLayoutMenuHistoryScope(input.getWorkbenchState())
      );
    },

    cancelLayoutInteraction(): void {
      input.updateWorkbenchState((state) => ({
        ...state,
        layoutInteraction: dismissLayoutInteraction()
      }));
    }
  };
}
