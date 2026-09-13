/** Native handles, URLs and polling belong to the host, not to workspace state. */
export type WorkbenchDetachedWindowOpening =
  | { status: 'blocked' }
  /** Logical detachment without a native window or closure observation. */
  | { status: 'unmanaged' }
  | {
      status: 'opened';
      /** May notify synchronously. Unsubscribe never closes the native window. */
      observeClosed(onClosed: () => void): () => void;
    };

export interface WorkbenchDetachedWindowHost {
  /** A thrown error means opening failed without retaining a native window. */
  open(windowId: string): WorkbenchDetachedWindowOpening;
}
