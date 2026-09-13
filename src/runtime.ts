// Explicit host assembly: no default browser providers are selected here.
export { createWorkbenchStoreRuntime } from './workbench/createWorkbenchStoreRuntime';
export type { CreateWorkbenchStoreRuntimeOptions } from './workbench/createWorkbenchStoreRuntime';
export type { WorkbenchHostEvents, WorkbenchHostEventHandlers, WorkbenchHostStorageChange } from './workbench/workbenchHostEvents';
export type { WorkbenchDetachedWindowHost, WorkbenchDetachedWindowOpening } from './workbench/workbenchDetachedWindowHost';
export type { WorkbenchShellPersistencePort } from './workbench/workbenchShellPersistence';
export type { WorkbenchFocusPersistencePort } from './workbench/workbenchFocusPersistence';
export type { WorkspaceSyncController, WorkspaceSyncSnapshot } from './workbench/workspaceSyncController';
