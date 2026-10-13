/** Canonical public domain. The legacy domain keeps working (its manifest is signed for it). */
export const APP_DOMAIN = "youcognito.vercel.app";
export const APP_URL = `https://${APP_DOMAIN}`;
export const LEGACY_DOMAIN = "template-eta-tan.vercel.app";
export const APP_DOMAINS = [APP_DOMAIN, LEGACY_DOMAIN] as const;

/** Pick the app domain a request arrived on (falls back to the canonical domain). */
export function domainFromRequest(request: Request): string {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host)
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  return (APP_DOMAINS as readonly string[]).includes(host) ? host : APP_DOMAIN;
}

export const miniAppEmbed = {
  version: "1",
  imageUrl: `${APP_URL}/miniapp-embed.png`,
  button: {
    title: "Claim free YOUCOG",
    action: {
      type: "launch_frame",
      name: "Youcognito",
      url: `${APP_URL}/`,
      splashImageUrl: `${APP_URL}/miniapp-splash.png`,
      splashBackgroundColor: "#000000",
    },
  },
};
