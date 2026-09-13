import type { WorkbenchHostEvents } from './workbenchHostEvents';

/** No host access or subscriptions until subscribe is called. */
export function createBrowserWorkbenchHostEvents(): WorkbenchHostEvents {
  return {
    subscribe(handlers) {
      const hostWindow = typeof window === 'undefined' ? null : window;
      const hostDocument = typeof document === 'undefined' ? null : document;
      let disposed = false;
      function boundary(): void {
        if (!disposed) handlers.onPersistenceBoundary();
      }
      function storage(event: StorageEvent): void {
        if (!disposed) handlers.onStorageChange({ key: event.key, newValue: event.newValue });
      }
      function visibility(): void {
        if (hostDocument?.visibilityState === 'hidden') boundary();
      }
      hostWindow?.addEventListener('pagehide', boundary);
      hostWindow?.addEventListener('beforeunload', boundary);
      hostWindow?.addEventListener('storage', storage);
      hostDocument?.addEventListener('visibilitychange', visibility);
      return () => {
        if (disposed) return;
        disposed = true;
        hostWindow?.removeEventListener('pagehide', boundary);
        hostWindow?.removeEventListener('beforeunload', boundary);
        hostWindow?.removeEventListener('storage', storage);
        hostDocument?.removeEventListener('visibilitychange', visibility);
      };
    }
  };
}
