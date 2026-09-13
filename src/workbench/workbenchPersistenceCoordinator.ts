import { createBrowserWorkbenchHostEvents } from './browserWorkbenchHostEvents';
import {
  createWorkbenchPersistenceRuntime,
  type CreateWorkbenchPersistenceRuntimeInput,
  type WorkbenchPersistenceState
} from './workbenchPersistenceRuntime';
import type { WorkbenchHostEvents } from './workbenchHostEvents';

export type {
  WorkbenchPersistenceState,
  WorkbenchPersistenceCoordinator
} from './workbenchPersistenceRuntime';

export type CreateWorkbenchPersistenceCoordinatorInput<TState extends WorkbenchPersistenceState> =
  Omit<CreateWorkbenchPersistenceRuntimeInput<TState>, 'hostEvents'> & {
    /** Undefined preserves browser defaults; null disables host notifications. */
    hostEvents?: WorkbenchHostEvents | null;
  };

/** Compatibility assembly; the runtime never chooses its event host. */
export function createWorkbenchPersistenceCoordinator<TState extends WorkbenchPersistenceState>(
  input: CreateWorkbenchPersistenceCoordinatorInput<TState>
) {
  return createWorkbenchPersistenceRuntime({
    ...input,
    hostEvents: input.hostEvents === undefined ? createBrowserWorkbenchHostEvents() : input.hostEvents
  });
}
