import type { WorkbenchDetachedWindowHost } from './workbenchDetachedWindowHost';

/** No host access until open; each observation owns only its polling timer. */
export function createBrowserDetachedWindowHost(): WorkbenchDetachedWindowHost {
  return {
    open(windowId) {
      const handle = openDetachedBrowserWindow(windowId);
      if (handle === null) return { status: 'blocked' };
      if (!handle || typeof handle.closed !== 'boolean') return { status: 'unmanaged' };
      return {
        status: 'opened',
        observeClosed(onClosed) {
          let active = true;
          let timer: ReturnType<typeof setTimeout>;
          const poll = () => {
            if (!active) return;
            if (handle.closed) {
              active = false;
              onClosed();
            } else timer = setTimeout(poll, 500);
          };
          timer = setTimeout(poll, 500);
          return () => {
            active = false;
            clearTimeout(timer);
          };
        }
      };
    }
  };
}

function openDetachedBrowserWindow(windowId: string): Window | null | undefined {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.set('window', windowId);
  const detachedWindow = window.open(
    url.toString(),
    `workbench-detached-${windowId}`,
    createDetachedWindowFeatures()
  );

  try {
    detachedWindow?.focus();
  } catch {
    // Focus denial does not undo a successful native opening.
  }
  return detachedWindow;
}

function createDetachedWindowFeatures(): string {
  if (typeof window === 'undefined') {
    return 'popup=yes,width=1280,height=860,resizable=yes,scrollbars=no';
  }

  const availableWidth = window.screen?.availWidth ?? window.outerWidth ?? 1440;
  const availableHeight = window.screen?.availHeight ?? window.outerHeight ?? 960;
  const width = Math.min(1280, Math.max(960, Math.round(availableWidth * 0.72)));
  const height = Math.min(900, Math.max(720, Math.round(availableHeight * 0.78)));
  const left = Math.max(0, Math.round((availableWidth - width) / 2));
  const top = Math.max(0, Math.round((availableHeight - height) / 2));

  return [
    'popup=yes',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'resizable=yes',
    'scrollbars=no'
  ].join(',');
}
