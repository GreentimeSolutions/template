/** Open an outside link: Mini App SDK openUrl inside Farcaster, a new tab elsewhere. */
export function openExternal(url: string, inMiniApp: boolean) {
  if (!inMiniApp) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  void import("@farcaster/miniapp-sdk")
    .then(({ sdk }) => sdk.actions.openUrl(url))
    .catch(() => window.open(url, "_blank", "noopener,noreferrer"));
}

/**
 * Open another Mini App inside Farcaster (so its wallet stays available).
 * Falls back to openUrl, then a normal tab, if the client cannot launch it.
 */
export function openMiniAppOrExternal(url: string, inMiniApp: boolean) {
  if (!inMiniApp) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  void import("@farcaster/miniapp-sdk")
    .then(async ({ sdk }) => {
      try {
        if (typeof sdk.actions.openMiniApp === "function") {
          await sdk.actions.openMiniApp({ url });
          return;
        }
      } catch {
        /* client may not support openMiniApp, or the target may not resolve as a Mini App */
      }
      return sdk.actions.openUrl(url);
    })
    .catch(() => window.open(url, "_blank", "noopener,noreferrer"));
}
