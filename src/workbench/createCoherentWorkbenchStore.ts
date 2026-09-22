import { createWorkspaceSessionState, createWorkspaceUsageBundle, serializeWorkspaceUsageContent, type WorkspacePresetArtifact, type WorkspaceUsageContext, type WorkspaceUsageContentPort } from '@konitif/workbench/workspace-contracts';
import { createWorkbenchStoreRuntime, type CreateWorkbenchStoreRuntimeOptions } from './createWorkbenchStoreRuntime';
import { createWorkbenchStateFactory } from './workbenchStateFactory';
import {
  createCoherentWorkbenchPersistence, restoreCoherentWorkbenchUsage,
  CoherentWorkbenchAdmissionError,
  type CoherentWorkbenchPersistenceHost, type CoherentWorkbenchPersistenceResult
} from './coherentWorkbenchPersistence';

export async function createCoherentWorkbenchStore(options: Omit<CreateWorkbenchStoreRuntimeOptions, 'coherentPersistence'> & {
  usageHost: CoherentWorkbenchPersistenceHost;
  content: WorkspaceUsageContentPort;
  context: WorkspaceUsageContext;
  source: WorkspacePresetArtifact;
  publicationMode: 'explicit' | 'boundaries';
  captureFragments(): Record<string, unknown>;
  onPersistenceResult(result: CoherentWorkbenchPersistenceResult): void;
}) {
  const context = JSON.parse(serializeWorkspaceUsageContent(options.context)) as WorkspaceUsageContext;
  const source = JSON.parse(serializeWorkspaceUsageContent(options.source)) as WorkspacePresetArtifact;
  const publicationMode = options.publicationMode;
  if (publicationMode !== 'explicit' && publicationMode !== 'boundaries') throw new TypeError('An explicit coherent publication mode is required.');
  const restored = await restoreCoherentWorkbenchUsage(options.usageHost, context, options.content);
  if (!restored) {
    const admission = await createWorkspaceUsageBundle({ source, context, fragments: { workspace: source.workspaceSession.workspace, shell: source.shellState, focus: source.workspaceSession.focus }, parentSnapshotId: null }, options.content);
    if (!admission.ok) throw new CoherentWorkbenchAdmissionError(admission.diagnostics);
  }
  const stateFactory = createWorkbenchStateFactory(options);
  const initialState = restored
    ? stateFactory.createWorkbenchState(createWorkspaceSessionState(restored.fragments.workspace, restored.fragments.focus), restored.fragments.shell)
    : stateFactory.createWorkbenchState(source.workspaceSession, source.shellState);
  const coherent = createCoherentWorkbenchPersistence({
    host: options.usageHost, content: options.content, context,
    source: restored?.source ?? source, restored, captureFragments: options.captureFragments,
    onResult: options.onPersistenceResult
  });
  const coordinator = {
    handleStateChange: coherent.handleStateChange,
    flush: publicationMode === 'boundaries' ? coherent.flush : () => {},
    dispose: coherent.dispose
  };
  const runtime = createWorkbenchStoreRuntime({ ...options, coherentPersistence: { initialState, coordinator } });
  return { ...runtime, restoredUsage: restored, saveUsage: coherent.save, rebindUsageSource: coherent.rebindSource, currentSnapshotId: coherent.currentSnapshotId };
}
