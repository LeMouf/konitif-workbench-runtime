import { get, writable } from 'svelte/store';
import {
  normalizeToolShellStatus,
  normalizeToolPanelLoadingState,
  normalizeToolResourceLoadingState,
  type ToolPanelLoadingState,
  type ToolResourceLoadingState,
  type ToolShellStatus,
  type Workspace
} from '@konitif/workbench/workspace-contracts';

export interface ToolRuntimeUiState {
  panelLoading: ToolPanelLoadingState | null;
  resourceLoading: ToolResourceLoadingState | null;
  shellStatus?: ToolShellStatus | null;
}

export type ToolRuntimeUiStateMap = Record<string, ToolRuntimeUiState | undefined>;

function samePanelLoadingState(
  left: ToolPanelLoadingState | null,
  right: ToolPanelLoadingState | null
): boolean {
  return left?.label === right?.label && left?.detail === right?.detail;
}

function sameResourceLoadingState(
  left: ToolResourceLoadingState | null,
  right: ToolResourceLoadingState | null
): boolean {
  return (
    left?.label === right?.label &&
    left?.detail === right?.detail &&
    left?.progress === right?.progress
  );
}

export interface WorkbenchToolRuntimeUiStore {
  store: ReturnType<typeof writable<ToolRuntimeUiStateMap>>;
  reset(): void;
  prune(toolInstances: Workspace['toolInstances']): void;
  setToolPanelLoadingState(toolInstanceId: string, nextLoading: ToolPanelLoadingState | null): boolean;
  setToolResourceLoadingState(toolInstanceId: string, nextLoading: ToolResourceLoadingState | null): boolean;
  setToolShellStatus(toolInstanceId: string, nextStatus: ToolShellStatus | null): boolean;
}

export function createWorkbenchToolRuntimeUiStore(
  getWorkspace: () => Workspace
): WorkbenchToolRuntimeUiStore {
  const store = writable<ToolRuntimeUiStateMap>({});

  function updateToolRuntimeUiState(
    toolInstanceId: string,
    updater: (state: ToolRuntimeUiState) => ToolRuntimeUiState
  ): boolean {
    const workspace = getWorkspace();

    if (!workspace.toolInstances[toolInstanceId]) {
      return false;
    }

    const entries = get(store);
    const nextEntry = updater(entries[toolInstanceId] ?? { panelLoading: null, resourceLoading: null });

    if (!nextEntry.panelLoading && !nextEntry.resourceLoading && nextEntry.shellStatus === undefined) {
      if (!(toolInstanceId in entries)) {
        return false;
      }

      const { [toolInstanceId]: _removed, ...rest } = entries;
      store.set(rest);
      return true;
    }

    const previousEntry = entries[toolInstanceId];

    if (
      samePanelLoadingState(previousEntry?.panelLoading ?? null, nextEntry.panelLoading) &&
      sameResourceLoadingState(previousEntry?.resourceLoading ?? null, nextEntry.resourceLoading) &&
      previousEntry?.shellStatus?.label === nextEntry.shellStatus?.label &&
      previousEntry?.shellStatus?.tone === nextEntry.shellStatus?.tone &&
      (previousEntry ? 'shellStatus' in previousEntry : false) === ('shellStatus' in nextEntry)
    ) {
      return false;
    }

    store.set({
      ...entries,
      [toolInstanceId]: nextEntry
    });

    return true;
  }

  return {
    store,
    reset(): void {
      store.set({});
    },
    prune(toolInstances: Workspace['toolInstances']): void {
      const activeToolInstanceIds = new Set(Object.keys(toolInstances));

      store.update((entries) => {
        let didChange = false;
        const nextEntries: ToolRuntimeUiStateMap = {};

        for (const [toolInstanceId, entry] of Object.entries(entries)) {
          if (activeToolInstanceIds.has(toolInstanceId)) {
            nextEntries[toolInstanceId] = entry;
          } else {
            didChange = true;
          }
        }

        return didChange ? nextEntries : entries;
      });
    },
    setToolPanelLoadingState(toolInstanceId: string, nextLoading: ToolPanelLoadingState | null): boolean {
      return updateToolRuntimeUiState(toolInstanceId, (state) => ({
        ...state,
        panelLoading: normalizeToolPanelLoadingState(nextLoading)
      }));
    },
    setToolResourceLoadingState(toolInstanceId: string, nextLoading: ToolResourceLoadingState | null): boolean {
      return updateToolRuntimeUiState(toolInstanceId, (state) => ({
        ...state,
        resourceLoading: normalizeToolResourceLoadingState(nextLoading)
      }));
    },
    setToolShellStatus(toolInstanceId: string, nextStatus: ToolShellStatus | null): boolean {
      const normalizedStatus = normalizeToolShellStatus(nextStatus);
      if (nextStatus !== null && normalizedStatus === null) return false;
      return updateToolRuntimeUiState(toolInstanceId, (state) => ({
        ...state,
        shellStatus: normalizedStatus
      }));
    }
  };
}
