/** The Farcaster host wallet's address on Base (asks to switch to Base first).
 *  By default only reads already-connected accounts (`eth_accounts`) so Mini App
 *  mounts never pop a wallet sheet. Pass `{ request: true }` from a user gesture
 *  (Claim / Connect) when a connect prompt is needed. */
export async function connectedBaseAddress(
  opts?: { request?: boolean },
): Promise<string | null> {
  const { sdk } = await import("@farcaster/miniapp-sdk");
  const provider = await sdk.wallet.getEthereumProvider();
  if (!provider) return null;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x2105" }],
    });
  } catch {
    /* host may already be on Base or not support switching */
  }
  let accounts = (await provider.request({
    method: "eth_accounts",
  }).catch(() => [])) as string[];
  if (!accounts?.[0] && opts?.request) {
    accounts = (await provider.request({
      method: "eth_requestAccounts",
    })) as string[];
  }
  return accounts?.[0] ?? null;
}
