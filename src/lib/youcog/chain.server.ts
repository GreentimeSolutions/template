/**
 * Fallback for block-explorer pages (basescan.org, etherscan.io) that sit
 * behind Cloudflare and refuse server-side reads. We read the same facts
 * straight from a public JSON-RPC node instead. No API key needed.
 */
const EXPLORERS: Record<string, { chain: string; rpc: string; symbol: string }> = {
  "basescan.org": { chain: "Base", rpc: "https://mainnet.base.org", symbol: "ETH" },
  "etherscan.io": { chain: "Ethereum", rpc: "https://ethereum-rpc.publicnode.com", symbol: "ETH" },
};

async function rpc(url: string, method: string, params: unknown[]): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: unknown };
    return typeof json.result === "string" ? json.result : null;
  } catch {
    return null;
  }
}

function decodeString(hex: string | null): string | null {
  if (!hex || hex.length < 66) return null;
  const body = hex.slice(2);
  try {
    if (body.length >= 192) {
      const len = Number.parseInt(body.slice(64, 128), 16);
      const raw = body.slice(128, 128 + len * 2);
      return Buffer.from(raw, "hex").toString("utf8").replace(/\u0000/g, "").trim() || null;
    }
    return Buffer.from(body.slice(0, 64), "hex").toString("utf8").replace(/\u0000/g, "").trim() || null;
  } catch {
    return null;
  }
}

function formatUnits(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const frac = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "").slice(0, 6);
  return `${whole.toLocaleString("en-US")}${frac ? `.${frac}` : ""}`;
}

export async function readExplorerPage(
  url: string,
): Promise<{ title: string; text: string } | null> {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, "");
  const explorer = EXPLORERS[host];
  if (!explorer) return null;
  const match = parsed.pathname.match(/^\/(token|address)\/(0x[0-9a-fA-F]{40})/);
  if (!match) return null;
  const address = match[2];
  const call = (data: string) => rpc(explorer.rpc, "eth_call", [{ to: address, data }, "latest"]);

  const [code, nameHex, symbolHex, decHex, supplyHex, balHex] = await Promise.all([
    rpc(explorer.rpc, "eth_getCode", [address, "latest"]),
    call("0x06fdde03"),
    call("0x95d89b41"),
    call("0x313ce567"),
    call("0x18160ddd"),
    rpc(explorer.rpc, "eth_getBalance", [address, "latest"]),
  ]);
  if (code === null && balHex === null) return null;

  const lines: string[] = [`Network: ${explorer.chain}`, `Address: ${address}`];
  const isContract = !!code && code !== "0x";
  lines.push(`Type: ${isContract ? "Smart contract" : "Wallet (no contract code)"}`);
  const name = decodeString(nameHex);
  const symbol = decodeString(symbolHex);
  const decimals = decHex && decHex.length > 2 ? Number(BigInt(decHex)) : null;
  if (name) lines.push(`Token name: ${name}`);
  if (symbol) lines.push(`Symbol: ${symbol}`);
  if (decimals !== null && decimals <= 36) lines.push(`Decimals: ${decimals}`);
  if (supplyHex && supplyHex.length > 2 && decimals !== null && decimals <= 36) {
    lines.push(`Total supply: ${formatUnits(BigInt(supplyHex), decimals)}${symbol ? ` ${symbol}` : ""}`);
  }
  if (balHex) lines.push(`${explorer.symbol} balance: ${formatUnits(BigInt(balHex), 18)} ${explorer.symbol}`);
  lines.push(
    `${host} blocks automated readers, so these facts were read live from a public ${explorer.chain} node. Holders, transfers and price are only on the explorer itself: ${url}`,
  );
  const label = name ? `${name}${symbol ? ` (${symbol})` : ""}` : address;
  return { title: `${label} · ${explorer.chain} ${match[1]}`, text: lines.join("\n\n") };
}
