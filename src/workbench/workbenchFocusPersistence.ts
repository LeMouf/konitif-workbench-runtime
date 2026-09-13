import {
  findPanelInWorkspace,
  normalizeWorkspaceFocus,
  type Workspace,
  type WorkspaceFocus
} from '@konitif/workbench';

export interface WorkbenchFocusPersistencePort {
  load(workspace: Workspace, fallback: WorkspaceFocus): WorkspaceFocus;
  save(focus: WorkspaceFocus): void;
  serialize(focus: WorkspaceFocus): string;
  normalize(input: unknown, workspace: Workspace, fallback: WorkspaceFocus): WorkspaceFocus;
}

interface LocalWorkbenchFocusPersistenceOptions {
  storageKey: string;
  isEnabled?: () => boolean;
}

export function createLocalWorkbenchFocusPersistence(
  options: LocalWorkbenchFocusPersistenceOptions
): WorkbenchFocusPersistencePort {
  return {
    load(workspace, fallback) {
      if (!isEnabled(options) || typeof localStorage === 'undefined') {
        return fallback;
      }

      try {
        const rawFocus = localStorage.getItem(options.storageKey);
        return rawFocus ? normalizePersistedWorkspaceFocus(JSON.parse(rawFocus), workspace, fallback) : fallback;
      } catch {
        return fallback;
      }
    },

    save(focus) {
      if (!isEnabled(options) || typeof localStorage === 'undefined') {
        return;
      }

      localStorage.setItem(options.storageKey, serializeWorkspaceFocus(focus));
    },

    serialize: serializeWorkspaceFocus,
    normalize: normalizePersistedWorkspaceFocus
  };
}

export function serializeWorkspaceFocus(focus: WorkspaceFocus): string {
  return JSON.stringify(focus);
}

export function normalizePersistedWorkspaceFocus(
  input: unknown,
  workspace: Workspace,
  fallback: WorkspaceFocus
): WorkspaceFocus {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return normalizeWorkspaceFocus(workspace, fallback);
  }

  const activePanelId = (input as Partial<WorkspaceFocus>).activePanelId;
  const requestedPanelId = typeof activePanelId === 'string' ? activePanelId : fallback.activePanelId;
  const validPanelId = requestedPanelId && findPanelInWorkspace(workspace, requestedPanelId)
    ? requestedPanelId
    : fallback.activePanelId;

  return normalizeWorkspaceFocus(workspace, {
    activePanelId: validPanelId
  });
}

function isEnabled(options: LocalWorkbenchFocusPersistenceOptions): boolean {
  return options.isEnabled?.() ?? true;
}
