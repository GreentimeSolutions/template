/** The Farcaster host wallet's address on Base.
 *  Does not switch chains — Mini App mounts and faucet expansion used to call
 *  wallet_switchEthereumChain here, which minimized the frame. Callers that
 *  send a transaction should pass chainId 0x2105 (Base) on the tx instead.
 *  By default only reads already-connected accounts (`eth_accounts`) so Mini App
 *  mounts never pop a wallet sheet. Pass `{ request: true }` from a user gesture
 *  (Claim / Connect) when a connect prompt is needed. */
export async function connectedBaseAddress(
  opts?: { request?: boolean },
): Promise<string | null> {
  const { sdk } = await import("@farcaster/miniapp-sdk");
  const provider = await sdk.wallet.getEthereumProvider();
  if (!provider) return null;
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
