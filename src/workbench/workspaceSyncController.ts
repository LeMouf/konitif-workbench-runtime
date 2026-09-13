import type { ShellState, Workspace, WorkspaceFocus } from '@konitif/workbench';

export interface WorkspaceSyncSnapshot {
  workspace: Workspace;
  shell?: ShellState;
  focus?: WorkspaceFocus;
}

export interface WorkspaceSyncController {
  publish(snapshot: WorkspaceSyncSnapshot): void;
  subscribe(handler: (snapshot: WorkspaceSyncSnapshot) => void): void | (() => void);
  /** Only the owner of this provider may close it. */
  dispose?(): void;
}

interface BrowserWorkspaceSyncControllerOptions {
  persistenceKey: string;
  isEnabled?: () => boolean;
}

type WorkspaceSyncMessage = {
  type: 'workbench.workspace.snapshot';
  persistenceKey: string;
  clientId: string;
  revision: number;
  workspace: Workspace;
  shell?: ShellState;
  focus?: WorkspaceFocus;
};

export function createBrowserWorkspaceSyncController(
  options: BrowserWorkspaceSyncControllerOptions
): WorkspaceSyncController & { dispose(): void } {
  const clientId = createWorkspaceSyncClientId(options.persistenceKey);
  const channel = createWorkspaceSyncChannel(options.persistenceKey);
  let lastPublishedSignature = '';
  let localRevision = 0;
  let acceptedAuthorityStamp = '';
  let disposed = false;

  return {
    publish(snapshot) {
      if (disposed || !isEnabled(options) || !channel) {
        return;
      }

      const signature = JSON.stringify(snapshot);

      if (signature === lastPublishedSignature) {
        return;
      }

      lastPublishedSignature = signature;
      localRevision += 1;
      acceptedAuthorityStamp = createAuthorityStamp(localRevision, clientId);
      channel.postMessage({
        type: 'workbench.workspace.snapshot',
        persistenceKey: options.persistenceKey,
        clientId,
        revision: localRevision,
        workspace: snapshot.workspace,
        shell: snapshot.shell,
        focus: snapshot.focus
      } satisfies WorkspaceSyncMessage);
    },

    subscribe(handler) {
      if (disposed || !channel) {
        return;
      }

      let active = true;
      const receive = (event: MessageEvent) => {
        if (disposed || !active || channel.onmessage !== receive || !isEnabled(options)) {
          return;
        }

        const message = normalizeWorkspaceSyncMessage(event.data);

        if (
          !message ||
          message.persistenceKey !== options.persistenceKey ||
          message.clientId === clientId
        ) {
          return;
        }

        localRevision = Math.max(localRevision, message.revision);
        const messageAuthorityStamp = createAuthorityStamp(message.revision, message.clientId);
        if (messageAuthorityStamp <= acceptedAuthorityStamp) {
          return;
        }
        acceptedAuthorityStamp = messageAuthorityStamp;

        handler({
          workspace: message.workspace,
          shell: message.shell,
          focus: message.focus
        });
      };
      channel.onmessage = receive;
      return () => {
        active = false;
        if (channel.onmessage === receive) channel.onmessage = null;
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (channel) {
        channel.onmessage = null;
        channel.close();
      }
    }
  };
}

function createWorkspaceSyncClientId(persistenceKey: string): string {
  const token = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${persistenceKey}:${token}`.replace(/[^a-zA-Z0-9._:-]/g, '_');
}

function createWorkspaceSyncChannel(persistenceKey: string): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }

  return new BroadcastChannel(`workbench.workspace:${persistenceKey}`);
}

function normalizeWorkspaceSyncMessage(input: unknown): WorkspaceSyncMessage | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const record = input as Partial<WorkspaceSyncMessage>;

  return record.type === 'workbench.workspace.snapshot' &&
    typeof record.persistenceKey === 'string' &&
    typeof record.clientId === 'string' &&
    typeof record.revision === 'number' &&
    Number.isSafeInteger(record.revision) &&
    record.revision > 0 &&
    !!record.workspace
    ? (record as WorkspaceSyncMessage)
    : null;
}

function createAuthorityStamp(revision: number, clientId: string): string {
  return `${revision.toString().padStart(16, '0')}:${clientId}`;
}

function isEnabled(options: BrowserWorkspaceSyncControllerOptions): boolean {
  return options.isEnabled?.() ?? true;
}
