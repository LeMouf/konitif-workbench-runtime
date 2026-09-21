import {
  admitWorkspaceUsageBundle, createWorkspaceUsageBundle, compareWorkspaceUsageSource,
  serializeWorkspaceUsageContent,
  exportWorkspaceSnapshot, validateWorkspace,
  type WorkspacePresetArtifact, type WorkspaceUsageBundle, type WorkspaceUsageContext,
  type WorkspaceUsageContentPort, type WorkspaceUsageDiagnostic, type WorkspaceUsageFragments
} from '@konitif/workbench/workspace-contracts';
import type { WorkbenchPersistenceState } from './workbenchPersistenceRuntime';

export type CoherentWorkbenchPersistenceResult =
  | { status: 'published'; snapshotId: string }
  | { status: 'conflict'; actualSnapshotId: string | null }
  | { status: 'refused'; diagnostics: WorkspaceUsageDiagnostic[] }
  | { status: 'failed'; message: string }
  | { status: 'disposed' };

export interface CoherentWorkbenchPersistenceHost {
  read(): Promise<unknown | null>;
  publish(bundle: WorkspaceUsageBundle, expectedSnapshotId: string | null): Promise<CoherentWorkbenchPersistenceResult>;
}

export interface CoherentWorkbenchPersistenceInput {
  host: CoherentWorkbenchPersistenceHost;
  content: WorkspaceUsageContentPort;
  context: WorkspaceUsageContext;
  source: WorkspacePresetArtifact;
  restored: WorkspaceUsageBundle | null;
  captureFragments(): Record<string, unknown>;
  onResult(result: CoherentWorkbenchPersistenceResult): void;
}

export function createCoherentWorkbenchPersistence(input: CoherentWorkbenchPersistenceInput) {
  const context = JSON.parse(serializeWorkspaceUsageContent(input.context)) as WorkspaceUsageContext;
  let source = JSON.parse(serializeWorkspaceUsageContent(input.source)) as WorkspacePresetArtifact;
  let head = input.restored?.snapshotId ?? null;
  let previous = input.restored?.snapshot ?? null;
  const sourceBindings = new Map<string, string>();
  if (previous) sourceBindings.set(`${previous.source.presetId}@${previous.source.revision}`, previous.source.contentId);
  let state: WorkbenchPersistenceState | null = null;
  let queue: Promise<CoherentWorkbenchPersistenceResult> = Promise.resolve({ status: 'disposed' });
  let disposed = false;

  function handleStateChange(next: WorkbenchPersistenceState): void {
    if (!disposed) state = next;
  }

  function save(): Promise<CoherentWorkbenchPersistenceResult> {
    if (disposed) return Promise.resolve({ status: 'disposed' });
    if (!state) return Promise.resolve(emit({ status: 'failed', message: 'No usage state was supplied.' }));
    let captured: { source: WorkspacePresetArtifact; fragments: WorkspaceUsageFragments };
    try {
      if (validateWorkspace(state.workspace).length) throw new TypeError('The workspace is not a valid serializable Workbench occurrence.');
      const workspace = JSON.parse(exportWorkspaceSnapshot(state.workspace));
      captured = JSON.parse(serializeWorkspaceUsageContent({ source, fragments: { ...input.captureFragments(), workspace, shell: state.shell, focus: state.focus } })) as typeof captured;
    } catch (error) {
      return Promise.resolve(emit({ status: 'failed', message: String(error) }));
    }
    queue = queue.then(async () => {
      if (disposed) return { status: 'disposed' };
      try {
        const prepared = await createWorkspaceUsageBundle({ ...captured, context, parentSnapshotId: head }, input.content);
        if (disposed) return { status: 'disposed' };
        if (!prepared.ok) return emit({ status: 'refused', diagnostics: prepared.diagnostics });
        const next = prepared.bundle.snapshot;
        const known = sourceBindings.get(`${next.source.presetId}@${next.source.revision}`);
        const diagnostics = previous ? compareWorkspaceUsageSource(previous, next) : [];
        if (known && known !== next.source.contentId) diagnostics.push({ code: 'usage.source-conflict', path: '$.source', message: 'This authored revision was already bound to other content in this session.' });
        if (diagnostics.length) return emit({ status: 'refused', diagnostics });
        if (disposed) return { status: 'disposed' };
        const result = await input.host.publish(prepared.bundle, head);
        if (result.status === 'published') {
          if (result.snapshotId !== prepared.bundle.snapshotId) return emit({ status: 'failed', message: 'Host returned an unexpected published identity; admission must be repeated.' });
          head = result.snapshotId;
          previous = next;
          sourceBindings.set(`${next.source.presetId}@${next.source.revision}`, next.source.contentId);
        }
        return emit(result);
      } catch (error) {
        return emit({ status: 'failed', message: String(error) });
      }
    }, () => emit({ status: 'failed', message: 'Unexpected persistence queue rejection.' }));
    return queue;
  }

  function emit(result: CoherentWorkbenchPersistenceResult): CoherentWorkbenchPersistenceResult {
    try { input.onResult(result); } catch { }
    return result;
  }

  return {
    handleStateChange,
    flush(): void { void save(); },
    save,
    rebindSource(next: WorkspacePresetArtifact): void {
      if (disposed) throw new Error('Persistence is disposed.');
      source = JSON.parse(serializeWorkspaceUsageContent(next)) as WorkspacePresetArtifact;
    },
    currentSnapshotId: () => head,
    dispose(): void { disposed = true; }
  };
}

export async function restoreCoherentWorkbenchUsage(host: CoherentWorkbenchPersistenceHost, context: WorkspaceUsageContext, content: WorkspaceUsageContentPort) {
  const value = await host.read();
  if (value === null) return null;
  const admission = await admitWorkspaceUsageBundle(value, context, content);
  if (!admission.ok) throw new CoherentWorkbenchAdmissionError(admission.diagnostics);
  return admission.bundle;
}

export class CoherentWorkbenchAdmissionError extends Error {
  constructor(readonly diagnostics: WorkspaceUsageDiagnostic[]) {
    super(diagnostics.map(issue => `${issue.code}: ${issue.message}`).join('; '));
  }
}
