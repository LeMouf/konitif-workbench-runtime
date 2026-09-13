import type { ShellRegionId, ShellState, ShellWidgetCatalog } from '@konitif/workbench';

export interface WorkbenchShellPersistencePort {
  load(fallback: ShellState): ShellState;
  save(shell: ShellState): void;
  serialize(shell: ShellState): string;
  normalize(input: unknown, fallback: ShellState): ShellState;
}

interface LocalWorkbenchShellPersistenceOptions {
  storageKey: string;
  isEnabled?: () => boolean;
  shellWidgetCatalog?: ShellWidgetCatalog;
}

export function createLocalWorkbenchShellPersistence(
  options: LocalWorkbenchShellPersistenceOptions
): WorkbenchShellPersistencePort {
  return {
    load(fallback) {
      if (!isEnabled(options) || typeof localStorage === 'undefined') {
        return fallback;
      }

      try {
        const rawShell = localStorage.getItem(options.storageKey);

        if (!rawShell) {
          return fallback;
        }

        return normalizePersistedShellState(JSON.parse(rawShell) as unknown, fallback, {
          shellWidgetCatalog: options.shellWidgetCatalog
        });
      } catch {
        return fallback;
      }
    },

    save(shell) {
      if (!isEnabled(options) || typeof localStorage === 'undefined') {
        return;
      }

      localStorage.setItem(options.storageKey, serializeShellState(shell));
    },

    serialize: serializeShellState,
    normalize(input, fallback) {
      return normalizePersistedShellState(input, fallback, {
        shellWidgetCatalog: options.shellWidgetCatalog
      });
    }
  };
}

export function serializeShellState(shell: ShellState): string {
  return JSON.stringify(shell);
}

export function normalizePersistedShellState(
  input: unknown,
  fallback: ShellState,
  options: { shellWidgetCatalog?: ShellWidgetCatalog } = {}
): ShellState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return fallback;
  }

  const persistedRegions = (input as Partial<ShellState>).regions;

  if (!persistedRegions || typeof persistedRegions !== 'object' || Array.isArray(persistedRegions)) {
    return fallback;
  }

  const regionIds: ShellRegionId[] = ['left', 'right', 'bottom'];

  return {
    regions: Object.fromEntries(
      regionIds.map((regionId) => {
        const fallbackRegion = fallback.regions[regionId];
        const persistedRegion = persistedRegions[regionId];

        if (!persistedRegion || typeof persistedRegion !== 'object' || Array.isArray(persistedRegion)) {
          return [regionId, fallbackRegion];
        }

        const nextWidgetIds = normalizePersistedShellWidgetIds(
          persistedRegion.widgetIds,
          fallbackRegion.widgetIds,
          options.shellWidgetCatalog
        );
        const isVisible = typeof persistedRegion.isVisible === 'boolean'
          ? persistedRegion.isVisible
          : fallbackRegion.isVisible;
        const activeWidgetId =
          typeof persistedRegion.activeWidgetId === 'string' && nextWidgetIds.includes(persistedRegion.activeWidgetId)
            ? persistedRegion.activeWidgetId
            : nextWidgetIds.includes(fallbackRegion.activeWidgetId ?? '')
              ? fallbackRegion.activeWidgetId
              : nextWidgetIds[0] ?? null;
        const minimumSize = regionId === 'bottom' ? 140 : 180;
        const size =
          typeof persistedRegion.size === 'number' && Number.isFinite(persistedRegion.size)
            ? Math.max(minimumSize, Math.round(persistedRegion.size))
            : fallbackRegion.size;
        const hiddenWidgetIds = normalizePersistedShellWidgetIds(
          persistedRegion.hiddenWidgetIds,
          [],
          options.shellWidgetCatalog
        ).filter((widgetId) => nextWidgetIds.includes(widgetId));
        const presentation = persistedRegion.presentation === 'stack' || persistedRegion.presentation === 'tabs'
          ? persistedRegion.presentation
          : fallbackRegion.presentation;
        const axis = persistedRegion.axis === 'horizontal' || persistedRegion.axis === 'vertical'
          ? persistedRegion.axis
          : fallbackRegion.axis;
        const visibleWidgetIds = nextWidgetIds.filter((widgetId) => !hiddenWidgetIds.includes(widgetId));
        const visibleActiveWidgetId = activeWidgetId && visibleWidgetIds.includes(activeWidgetId)
          ? activeWidgetId
          : visibleWidgetIds[0] ?? null;

        return [
          regionId,
          {
            ...fallbackRegion,
            isVisible: visibleWidgetIds.length > 0 && isVisible,
            isOpen: visibleWidgetIds.length > 0 && isVisible
              ? typeof persistedRegion.isOpen === 'boolean'
                ? persistedRegion.isOpen
                : fallbackRegion.isOpen
              : false,
            size,
            activeWidgetId: visibleActiveWidgetId,
            widgetIds: nextWidgetIds,
            hiddenWidgetIds,
            presentation,
            axis
          }
        ];
      })
    ) as ShellState['regions']
  };
}

function isEnabled(options: LocalWorkbenchShellPersistenceOptions): boolean {
  return options.isEnabled?.() ?? true;
}

function normalizePersistedShellWidgetIds(
  input: unknown,
  fallbackWidgetIds: string[],
  shellWidgetCatalog: ShellWidgetCatalog | undefined
): string[] {
  if (!Array.isArray(input)) {
    return fallbackWidgetIds;
  }

  const normalizedWidgetIds: string[] = [];

  for (const value of input) {
    if (typeof value !== 'string') {
      continue;
    }

    const widgetId = value.trim();

    if (
      widgetId &&
      !normalizedWidgetIds.includes(widgetId) &&
      isKnownShellWidgetId(widgetId, fallbackWidgetIds, shellWidgetCatalog)
    ) {
      normalizedWidgetIds.push(widgetId);
    }
  }

  return normalizedWidgetIds;
}

function isKnownShellWidgetId(
  widgetId: string,
  fallbackWidgetIds: string[],
  shellWidgetCatalog: ShellWidgetCatalog | undefined
): boolean {
  if (fallbackWidgetIds.includes(widgetId)) {
    return true;
  }

  return Boolean(shellWidgetCatalog?.getDefinition(widgetId));
}
