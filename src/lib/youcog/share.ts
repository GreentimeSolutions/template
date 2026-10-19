import { APP_URL } from "@/lib/youcog/miniapp";

export function streakText(streak: number) {
  return streak > 1
    ? `I'm on a ${streak}-day $YOUCOG streak on Youcognito. Private AI research + a daily YOUCOG faucet on Base:`
    : `I just claimed my daily $YOUCOG on Youcognito. Start your streak:`;
}

/** Compose a cast: Mini App SDK inside Farcaster/Base app, Farcaster web composer otherwise. */
export async function shareToFarcaster(text: string, inMiniApp: boolean) {
  if (inMiniApp) {
    const { sdk } = await import("@farcaster/miniapp-sdk");
    await sdk.actions.composeCast({ text, embeds: [APP_URL] }).catch(() => undefined);
    return;
  }
  const url = `https://farcaster.xyz/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(APP_URL)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
