/**
 * Safe teardown for the SoundCloud Widget API.
 *
 * SC's `widget.unbind()` posts a message into the embed iframe. When React
 * unmounts the faucet card (for example when a mission's answer arrives and the
 * sidebar is swapped for the sealed tabs), the iframe is already detached, its
 * `contentWindow` is null, and SC throws
 * "Cannot read properties of null (reading 'postMessage')". Thrown from an effect
 * cleanup, that reached the router error boundary and blanked the whole app.
 *
 * A detached embed has no listeners left to remove, so skip it, and never let a
 * third-party widget error escape the cleanup.
 */
export type UnbindableWidget = { unbind: (event: string) => void };
type FrameLike = { isConnected?: boolean; contentWindow?: unknown };

export const SC_LISTEN_EVENTS = ["play", "playProgress", "seek", "finish"] as const;

export function safeUnbindAll(
  widget: UnbindableWidget | null | undefined,
  frame: FrameLike | null | undefined,
  events: readonly string[] = SC_LISTEN_EVENTS,
): number {
  if (!widget || !frame) return 0;
  if (frame.isConnected === false || !frame.contentWindow) return 0;
  let removed = 0;
  for (const ev of events) {
    try {
      widget.unbind(ev);
      removed += 1;
    } catch {
      /* the embed went away mid-teardown; nothing left to unbind */
    }
  }
  return removed;
}
