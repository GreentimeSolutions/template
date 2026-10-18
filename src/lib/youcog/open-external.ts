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
