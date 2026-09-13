/** Notifications only; the persistence coordinator owns admission and effects. */
export interface WorkbenchHostStorageChange {
  key: string | null;
  newValue: string | null;
}

export interface WorkbenchHostEventHandlers {
  onPersistenceBoundary(): void;
  onStorageChange(event: WorkbenchHostStorageChange): void;
}

export interface WorkbenchHostEvents {
  /** Own only this subscription. Return an idempotent unsubscribe function. */
  subscribe(handlers: WorkbenchHostEventHandlers): () => void;
}
