/** The Farcaster host wallet's address on Base (asks to switch to Base first). */
export async function connectedBaseAddress(): Promise<string | null> {
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
  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  return accounts?.[0] ?? null;
}
