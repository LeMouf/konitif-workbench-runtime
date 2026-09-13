export type WorkbenchHistoryScope = 'none' | 'app' | 'core' | 'both';
export type WorkbenchHistoryChannel = 'app' | 'core';

export interface WorkbenchHistoryStatus {
  app: {
    canUndo: boolean;
    canRedo: boolean;
  };
  core: {
    canUndo: boolean;
    canRedo: boolean;
  };
}

export interface WorkspaceHistoryController<TSnapshot> {
  getStatus(): WorkbenchHistoryStatus;
  reset(): void;
  recordTransition(previousSnapshot: TSnapshot, nextSnapshot: TSnapshot, scope: WorkbenchHistoryScope): void;
  beginTransaction(channel: WorkbenchHistoryChannel, snapshot: TSnapshot): void;
  commitTransaction(channel: WorkbenchHistoryChannel, currentSnapshot: TSnapshot): void;
  cancelTransaction(channel: WorkbenchHistoryChannel): TSnapshot | null;
  undo(channel: WorkbenchHistoryChannel, currentSnapshot: TSnapshot): TSnapshot | null;
  redo(channel: WorkbenchHistoryChannel, currentSnapshot: TSnapshot): TSnapshot | null;
}

interface WorkspaceHistoryControllerOptions<TSnapshot> {
  isChanged: (left: TSnapshot, right: TSnapshot) => boolean;
  maxEntries?: number;
}

interface WorkspaceHistoryBucket<TSnapshot> {
  past: TSnapshot[];
  future: TSnapshot[];
  transaction: TSnapshot | null;
  shouldRecord: boolean;
}

const DEFAULT_MAX_HISTORY_ENTRIES = 100;

export function createWorkspaceHistoryController<TSnapshot>(
  options: WorkspaceHistoryControllerOptions<TSnapshot>
): WorkspaceHistoryController<TSnapshot> {
  const maxEntries = Math.max(1, Math.floor(options.maxEntries ?? DEFAULT_MAX_HISTORY_ENTRIES));
  const buckets: Record<WorkbenchHistoryChannel, WorkspaceHistoryBucket<TSnapshot>> = {
    app: createBucket(),
    core: createBucket()
  };

  function getStatus(): WorkbenchHistoryStatus {
    return {
      app: {
        canUndo: buckets.app.past.length > 0,
        canRedo: buckets.app.future.length > 0
      },
      core: {
        canUndo: buckets.core.past.length > 0,
        canRedo: buckets.core.future.length > 0
      }
    };
  }

  function reset(): void {
    resetBucket(buckets.app);
    resetBucket(buckets.core);
  }

  function recordTransition(
    previousSnapshot: TSnapshot,
    nextSnapshot: TSnapshot,
    scope: WorkbenchHistoryScope
  ): void {
    if (scope === 'none' || !options.isChanged(previousSnapshot, nextSnapshot)) {
      return;
    }

    for (const channel of resolveChannels(scope)) {
      const bucket = buckets[channel];

      if (!bucket.shouldRecord) {
        continue;
      }

      bucket.past = pushHistoryEntry(bucket.past, previousSnapshot);
      bucket.future = [];
    }
  }

  function beginTransaction(channel: WorkbenchHistoryChannel, snapshot: TSnapshot): void {
    const bucket = buckets[channel];

    if (bucket.transaction) {
      return;
    }

    bucket.transaction = snapshot;
    bucket.shouldRecord = false;
  }

  function commitTransaction(channel: WorkbenchHistoryChannel, currentSnapshot: TSnapshot): void {
    const bucket = buckets[channel];

    if (!bucket.transaction) {
      return;
    }

    if (options.isChanged(bucket.transaction, currentSnapshot)) {
      bucket.past = pushHistoryEntry(bucket.past, bucket.transaction);
      bucket.future = [];
    }

    bucket.transaction = null;
    bucket.shouldRecord = true;
  }

  function cancelTransaction(channel: WorkbenchHistoryChannel): TSnapshot | null {
    const bucket = buckets[channel];
    const snapshot = bucket.transaction;

    if (!snapshot) {
      return null;
    }

    bucket.transaction = null;
    bucket.shouldRecord = true;
    return snapshot;
  }

  function undo(channel: WorkbenchHistoryChannel, currentSnapshot: TSnapshot): TSnapshot | null {
    const bucket = buckets[channel];
    const snapshot = bucket.past.length > 0 ? bucket.past[bucket.past.length - 1] : null;

    if (!snapshot) {
      return null;
    }

    bucket.past = bucket.past.slice(0, -1);
    bucket.future = pushHistoryEntry(bucket.future, currentSnapshot);
    return snapshot;
  }

  function redo(channel: WorkbenchHistoryChannel, currentSnapshot: TSnapshot): TSnapshot | null {
    const bucket = buckets[channel];
    const snapshot = bucket.future.length > 0 ? bucket.future[bucket.future.length - 1] : null;

    if (!snapshot) {
      return null;
    }

    bucket.future = bucket.future.slice(0, -1);
    bucket.past = pushHistoryEntry(bucket.past, currentSnapshot);
    return snapshot;
  }

  function pushHistoryEntry(entries: TSnapshot[], entry: TSnapshot): TSnapshot[] {
    return [...entries, entry].slice(-maxEntries);
  }

  return {
    getStatus,
    reset,
    recordTransition,
    beginTransaction,
    commitTransaction,
    cancelTransaction,
    undo,
    redo
  };
}

function createBucket<TSnapshot>(): WorkspaceHistoryBucket<TSnapshot> {
  return {
    past: [],
    future: [],
    transaction: null,
    shouldRecord: true
  };
}

function resetBucket<TSnapshot>(bucket: WorkspaceHistoryBucket<TSnapshot>): void {
  bucket.past = [];
  bucket.future = [];
  bucket.transaction = null;
  bucket.shouldRecord = true;
}

function resolveChannels(scope: WorkbenchHistoryScope): WorkbenchHistoryChannel[] {
  switch (scope) {
    case 'app':
      return ['app'];
    case 'core':
      return ['core'];
    case 'both':
      return ['app', 'core'];
    case 'none':
      return [];
  }
}
