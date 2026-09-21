import { createWorkspace, type Workspace } from '@konitif/workbench/workspace-contracts';
import { createWorkbenchStore } from '@konitif/workbench-runtime';
import {
  createWorkbenchStoreRuntime,
  createCoherentWorkbenchStore,
  type CreateWorkbenchStoreRuntimeOptions,
  type WorkbenchHostEvents,
  type WorkspaceSyncController,
} from '@konitif/workbench-runtime/runtime';

export function assemble(options: CreateWorkbenchStoreRuntimeOptions): Workspace {
  void createWorkbenchStore;
  void createWorkbenchStoreRuntime;
  void createCoherentWorkbenchStore;
  void (null as unknown as WorkbenchHostEvents);
  void (null as unknown as WorkspaceSyncController);
  return createWorkspace();
}
