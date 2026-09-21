import {
  addShellWidgetToRegion,
  activateShellWidget,
  moveShellWidgetToRegion,
  removeShellWidgetFromRegion,
  setShellRegionArrangement,
  setShellRegionWidgetProportions,
  setShellRegionOpen,
  setShellRegionSize,
  setShellRegionWidgetVisible,
  setShellRegionVisible,
  type LayoutInteractionState,
  type ShellRegionId,
  type ShellRegionAxis,
  type ShellRegionPresentation,
  type ShellState,
  type ShellWidgetPlacement,
  type Workspace,
  type WorkspaceFocus
} from '@konitif/workbench/workspace-contracts';
import type { WorkbenchHistoryScope } from './workspaceHistoryController';

export interface WorkbenchShellActionState {
  workspace: Workspace;
  focus: WorkspaceFocus;
  shell: ShellState;
  layoutInteraction: LayoutInteractionState;
}

export interface WorkbenchShellActions {
  addShellWidgetToRegion(regionId: ShellRegionId, widgetId: string, placement?: ShellWidgetPlacement): void;
  activateShellWidget(regionId: ShellRegionId, widgetId: string): void;
  moveShellWidgetToRegion(regionId: ShellRegionId, widgetId: string, placement?: ShellWidgetPlacement): void;
  removeShellWidgetFromRegion(regionId: ShellRegionId, widgetId: string): void;
  setShellRegionArrangement(
    regionId: ShellRegionId,
    presentation: ShellRegionPresentation,
    axis?: ShellRegionAxis
  ): void;
  setShellRegionWidgetProportions(regionId: ShellRegionId, proportions: Record<string, number>): void;
  setShellRegionOpen(regionId: ShellRegionId, isOpen: boolean): void;
  setShellRegionVisible(regionId: ShellRegionId, isVisible: boolean): void;
  setShellRegionWidgetVisible(regionId: ShellRegionId, widgetId: string, isVisible: boolean): void;
  setShellRegionSize(regionId: ShellRegionId, size: number): void;
}

export interface CreateWorkbenchShellActionsInput<TState extends WorkbenchShellActionState> {
  updateWorkbenchState(updater: (state: TState) => TState, historyScope?: WorkbenchHistoryScope): void;
  flushPersistence?(): void;
}

export function createWorkbenchShellActions<TState extends WorkbenchShellActionState>(
  input: CreateWorkbenchShellActionsInput<TState>
): WorkbenchShellActions {
  function commitShellInteraction(updater: (state: TState) => TState): void {
    input.updateWorkbenchState(updater, 'core');
    input.flushPersistence?.();
  }

  return {
    addShellWidgetToRegion(regionId: ShellRegionId, widgetId: string, placement: ShellWidgetPlacement = {}): void {
      commitShellInteraction((state) => ({
        ...state,
        shell: addShellWidgetToRegion(state.shell, regionId, widgetId, placement)
      }));
    },

    activateShellWidget(regionId: ShellRegionId, widgetId: string): void {
      commitShellInteraction((state) => ({
        ...state,
        shell: activateShellWidget(state.shell, regionId, widgetId)
      }));
    },

    moveShellWidgetToRegion(regionId: ShellRegionId, widgetId: string, placement: ShellWidgetPlacement = {}): void {
      commitShellInteraction((state) => ({
        ...state,
        shell: moveShellWidgetToRegion(state.shell, regionId, widgetId, placement)
      }));
    },

    removeShellWidgetFromRegion(regionId: ShellRegionId, widgetId: string): void {
      commitShellInteraction((state) => ({
        ...state,
        shell: removeShellWidgetFromRegion(state.shell, regionId, widgetId)
      }));
    },

    setShellRegionArrangement(
      regionId: ShellRegionId,
      presentation: ShellRegionPresentation,
      axis?: ShellRegionAxis
    ): void {
      commitShellInteraction((state) => ({
        ...state,
        shell: setShellRegionArrangement(state.shell, regionId, presentation, axis)
      }));
    },

    setShellRegionWidgetProportions(regionId: ShellRegionId, proportions: Record<string, number>): void {
      commitShellInteraction(state => ({ ...state, shell: setShellRegionWidgetProportions(state.shell, regionId, proportions) }));
    },

    setShellRegionOpen(regionId: ShellRegionId, isOpen: boolean): void {
      commitShellInteraction((state) => ({
        ...state,
        shell: setShellRegionOpen(state.shell, regionId, isOpen)
      }));
    },

    setShellRegionVisible(regionId: ShellRegionId, isVisible: boolean): void {
      commitShellInteraction((state) => ({
        ...state,
        shell: setShellRegionVisible(state.shell, regionId, isVisible)
      }));
    },

    setShellRegionWidgetVisible(regionId: ShellRegionId, widgetId: string, isVisible: boolean): void {
      commitShellInteraction((state) => ({
        ...state,
        shell: setShellRegionWidgetVisible(state.shell, regionId, widgetId, isVisible)
      }));
    },

    setShellRegionSize(regionId: ShellRegionId, size: number): void {
      input.updateWorkbenchState((state) => ({
        ...state,
        shell: setShellRegionSize(state.shell, regionId, size)
      }), 'core');
    }
  };
}
