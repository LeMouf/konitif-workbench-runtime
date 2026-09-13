import { createBrowserDetachedWindowHost } from './browserDetachedWindowHost';
import { createWorkbenchWindowRuntime, type CreateWorkbenchWindowRuntimeInput, type WorkbenchWindowActionState } from './workbenchWindowRuntime';
import type { WorkbenchDetachedWindowHost } from './workbenchDetachedWindowHost';

export type { WorkbenchWindowActionState } from './workbenchWindowRuntime';
export type CreateWorkbenchWindowActionsInput<TState extends WorkbenchWindowActionState> =
  Omit<CreateWorkbenchWindowRuntimeInput<TState>, 'detachedWindows'> & {
    detachedWindows?: WorkbenchDetachedWindowHost | null;
  };

export function createWorkbenchWindowActions<TState extends WorkbenchWindowActionState>(
  input: CreateWorkbenchWindowActionsInput<TState>
) {
  return createWorkbenchWindowRuntime({
    ...input,
    detachedWindows: input.detachedWindows === undefined ? createBrowserDetachedWindowHost() : input.detachedWindows
  });
}
