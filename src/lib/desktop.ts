/**
 * The ZUNO desktop app (Tauri) injects `window.zunoDesktop` into the page.
 * The website never exposes this, so everything here is a no-op in a browser
 * beyond the normal permission-gated Notification API.
 */
interface DesktopBridge {
  notify?: (title: string, body: string) => Promise<unknown> | unknown;
}

function bridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const candidate = (window as Window & { zunoDesktop?: DesktopBridge }).zunoDesktop;
  return candidate && typeof candidate.notify === "function" ? candidate : null;
}

export function isDesktopApp(): boolean {
  return !!bridge() || (typeof window !== "undefined" && (window as Window & { __ZUNO_DESKTOP__?: boolean }).__ZUNO_DESKTOP__ === true);
}

/** Prefer native OS notifications in the desktop app, fall back to the web API. */
export function notifyDesktop(title: string, body: string): void {
  const native = bridge();
  if (native?.notify) {
    try {
      void Promise.resolve(native.notify(title, body)).catch(() => undefined);
    } catch {
      /* ignore bridge failures */
    }
    return;
  }
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!document.hidden) return;
    new Notification(title, { body, icon: "/zuno-mark.svg" });
  } catch {
    /* notifications are best-effort */
  }
}
