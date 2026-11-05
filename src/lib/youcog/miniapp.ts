/** Canonical public domain. Legacy vercel.app hosts keep working (each has its own signed manifest). */
export const APP_DOMAIN = "youcognito.com";
export const APP_URL = `https://${APP_DOMAIN}`;
export const YOUCOGNITO_VERCEL_DOMAIN = "youcognito.vercel.app";
export const LEGACY_DOMAIN = "template-eta-tan.vercel.app";
export const APP_DOMAINS = [APP_DOMAIN, "www.youcognito.com", YOUCOGNITO_VERCEL_DOMAIN, LEGACY_DOMAIN] as const;

/** Pick the app domain a request arrived on (falls back to the canonical domain). www → apex. */
export function domainFromRequest(request: Request): string {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host)
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  if (host === "www.youcognito.com") return APP_DOMAIN;
  return (APP_DOMAINS as readonly string[]).includes(host) ? host : APP_DOMAIN;
}

export const miniAppEmbed = {
  version: "1",
  imageUrl: `${APP_URL}/miniapp-embed.jpg?v=gift`,
  button: {
    title: "Open Youcognito",
    action: {
      type: "launch_frame",
      name: "Youcognito",
      url: `${APP_URL}/`,
      splashImageUrl: `${APP_URL}/miniapp-splash.png`,
      splashBackgroundColor: "#000000",
    },
  },
};
