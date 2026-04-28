/**
 * Bridge debug logger. Callers already gate these logs behind bridge debug prefs,
 * so this file only needs to emit them consistently in Zotero/browser contexts.
 */
const PREFIX = "[ClaudeBridge]";

function formatMessage(message: string, payload?: unknown): string {
  if (payload === undefined) {
    return `${PREFIX} ${message}`;
  }
  try {
    return `${PREFIX} ${message} | ${JSON.stringify(payload)}`;
  } catch {
    return `${PREFIX} ${message}`;
  }
}

export function dbg(message: string, payload?: unknown): void {
  const fullMessage = formatMessage(message, payload);
  try {
    ztoolkit?.log?.(fullMessage);
  } catch {
    // ignore debug logging failures
  }
  try {
    console.log(fullMessage);
  } catch {
    // ignore debug logging failures
  }
}

export function dbgError(message: string, error: unknown): void {
  const fullMessage = formatMessage(
    `ERROR: ${message}`,
    error instanceof Error ? { message: error.message } : error,
  );
  try {
    ztoolkit?.log?.(fullMessage);
  } catch {
    // ignore debug logging failures
  }
  try {
    console.error(fullMessage);
  } catch {
    // ignore debug logging failures
  }
}
