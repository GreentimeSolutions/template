/**
 * Ghost Lab chain access (browser). Reads via public Base RPC; writes go through the
 * Farcaster Mini App wallet (or an injected wallet), same pattern as donate.tsx.
 * Flag: VITE_GHOST_LAB=1 (off by default). Contract: VITE_GHOSTS_CONTRACT.
 */
import { createPublicClient, decodeEventLog, encodeFunctionData, http, isAddress, parseAbi, type Address, type Hex } from "viem";
import { base } from "viem/chains";
import { withSuffix } from "./builder-code";
import { decodeTokenUri, freeLeft, type LabChain } from "./ghost-lab-core";

export const ghostLabEnabled = () => import.meta.env.VITE_GHOST_LAB === "1";
export const ghostsContract = (): Address | null => {
  const a = import.meta.env.VITE_GHOSTS_CONTRACT as string | undefined;
  return a && isAddress(a) ? (a as Address) : null;
};
/** Simulated wallet for local previews/recordings only; never active in production builds. */
export const demoMode = () => import.meta.env.DEV && typeof location !== "undefined" && new URLSearchParams(location.search).has("demo");

export const YOUCOG: Address = "0x92Bff5D88157114DfC4a0A00F3496AA7e2E7EbA3";
export const ghostsAbi = parseAbi([
  "function owner() view returns (address)",
  "function ownerMint(address to, uint8[6] traits) returns (uint256)",
  "function unpause()",
  "function paused() view returns (bool)",
  "function totalSupply() view returns (uint256)",
  "function freeUntil() view returns (uint256)",
  "function reserveMinted() view returns (uint256)",
  "function currentPrice() view returns (uint256)",
  "function hasMinted(address) view returns (bool)",
  "function voucherSigner() view returns (address)",
  "function previewSvg(uint8[6] traits) pure returns (string)",
  "function tokenURI(uint256 id) view returns (string)",
  "function mint(uint8[6] traits, uint256 maxPrice, uint256 fid, uint256 deadline, bytes sig) returns (uint256)",
  "event Minted(address indexed to, uint256 indexed tokenId, uint8[6] traits, uint256 paid, uint256 fid)",
]);
const erc20Abi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);
const client = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
const BASE_HEX = "0x2105";
async function getProvider(): Promise<Eip1193 | null> {
  try {
    const { sdk } = await import("@farcaster/miniapp-sdk");
    if (await sdk.isInMiniApp()) {
      const p = await sdk.wallet.getEthereumProvider();
      if (p) return p as unknown as Eip1193;
    }
  } catch { /* not in a mini app */ }
  return (globalThis as { ethereum?: Eip1193 }).ethereum ?? null;
}

export async function connect(): Promise<{ p: Eip1193; from: Address }> {
  const p = await getProvider();
  if (!p) throw new Error("No wallet found. Open Youcognito inside Farcaster or a wallet browser.");
  const accounts = (await p.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.[0]) throw new Error("No account connected.");
  await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_HEX }] }).catch(() => {});
  return { p, from: accounts[0] as Address };
}

export async function readLab(addr: Address, who?: Address): Promise<LabChain & { voucher: boolean }> {
  const r = (fn: "paused" | "totalSupply" | "reserveMinted" | "currentPrice" | "voucherSigner") =>
    client.readContract({ address: addr, abi: ghostsAbi, functionName: fn });
  const [paused, ts, rm, price, vs, has] = await Promise.all([
    r("paused"), r("totalSupply"), r("reserveMinted"), r("currentPrice"), r("voucherSigner"),
    who ? client.readContract({ address: addr, abi: ghostsAbi, functionName: "hasMinted", args: [who] }) : Promise.resolve(false),
  ]);
  return {
    paused: paused as boolean, totalSupply: Number(ts), reserveMinted: Number(rm), price: price as bigint,
    hasMinted: has as boolean, voucher: (vs as string) !== "0x0000000000000000000000000000000000000000",
  };
}


/** Live free-mint window for the home Bankr credit card. */
export async function readFreeMint(addr: Address): Promise<{ freeUntil: number; totalSupply: number; freeLeft: number }> {
  const [fu, ts] = await Promise.all([
    client.readContract({ address: addr, abi: ghostsAbi, functionName: "freeUntil" }),
    client.readContract({ address: addr, abi: ghostsAbi, functionName: "totalSupply" }),
  ]);
  const freeUntil = Number(fu), totalSupply = Number(ts);
  return { freeUntil, totalSupply, freeLeft: freeLeft(freeUntil, totalSupply) };
}
export async function previewSvg(addr: Address, traits: number[]): Promise<string> {
  return client.readContract({ address: addr, abi: ghostsAbi, functionName: "previewSvg", args: [traits as unknown as readonly [number, number, number, number, number, number]] });
}

async function send(p: Eip1193, from: Address, to: Address, data: Hex): Promise<Hex> {
  const hash = (await p.request({ method: "eth_sendTransaction", params: [{ from, to, data: withSuffix(data), value: "0x0" }] })) as Hex;
  const rc = await client.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error("Transaction failed on-chain.");
  return hash;
}

export type MintStep = "connect" | "approve" | "mint" | "confirm";
/**
 * Real mint. Cosmetic ownership is NOT checked (the contract does not check it either).
 * maxPrice = the price shown to the user; the contract reverts if it rose in flight.
 */
export async function mintGhost(addr: Address, traits: number[], onStep: (s: MintStep) => void) {
  onStep("connect");
  const { p, from } = await connect();
  const st = await readLab(addr, from);
  if (st.paused) throw new Error("Minting is paused right now.");
  if (st.hasMinted) throw new Error("This wallet already minted its ghost (one per wallet).");
  if (st.voucher) throw new Error("Minting currently needs a Farcaster voucher, which this version of the Lab doesn't support yet.");
  const maxPrice = st.price;
  if (maxPrice > 0n) {
    const [bal, allow] = await Promise.all([
      client.readContract({ address: YOUCOG, abi: erc20Abi, functionName: "balanceOf", args: [from] }),
      client.readContract({ address: YOUCOG, abi: erc20Abi, functionName: "allowance", args: [from, addr] }),
    ]);
    if (bal < maxPrice) throw new Error("Not enough YOUCOG in this wallet for the mint price.");
    if (allow < maxPrice) {
      onStep("approve");
      await send(p, from, YOUCOG, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [addr, maxPrice] }));
    }
  }
  onStep("mint");
  const data = encodeFunctionData({
    abi: ghostsAbi, functionName: "mint",
    args: [traits as unknown as readonly [number, number, number, number, number, number], maxPrice, 0n, 0n, "0x"],
  });
  const hash = (await p.request({ method: "eth_sendTransaction", params: [{ from, to: addr, data: withSuffix(data), value: "0x0" }] })) as Hex;
  onStep("confirm");
  const rc = await client.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error("Mint failed on-chain. No ghost was created.");
  let id = 0n;
  for (const l of rc.logs) {
    if (l.address.toLowerCase() !== addr.toLowerCase()) continue;
    try { const ev = decodeEventLog({ abi: ghostsAbi, data: l.data, topics: l.topics }); if (ev.eventName === "Minted") id = ev.args.tokenId; } catch { /* other event */ }
  }
  const uri = await client.readContract({ address: addr, abi: ghostsAbi, functionName: "tokenURI", args: [id] });
  return { id: Number(id), hash, ...decodeTokenUri(uri) };
}

export const friendlyError = (e: unknown) => {
  const m = (e as { shortMessage?: string; message?: string })?.shortMessage ?? (e as Error)?.message ?? "Something went wrong.";
  if (/reject|denied/i.test(m)) return "Transaction cancelled.";
  if (/insufficient funds|gas required exceeds/i.test(m)) return "Not enough ETH on Base for gas.";
  if (/transfer amount exceeds balance/i.test(m)) return "Not enough YOUCOG in this wallet.";
  if (/PriceAboveMax/.test(m)) return "The mint price changed. Check the new price and try again.";
  if (/AlreadyMinted/.test(m)) return "This wallet already minted its ghost.";
  if (/SoldOut/.test(m)) return "All public ghosts have been minted.";
  return m.slice(0, 160);
};

/** Owner-only actions (contract enforces onlyOwner; the UI only shows them to the owner). */
export async function connectedOwner(addr: Address): Promise<Address | null> {
  const { from } = await connect();
  const o = await client.readContract({ address: addr, abi: ghostsAbi, functionName: "owner" });
  return o.toLowerCase() === from.toLowerCase() ? from : null;
}
export async function ownerMintTo(addr: Address, traits: number[]) {
  const { p, from } = await connect();
  const data = encodeFunctionData({ abi: ghostsAbi, functionName: "ownerMint", args: [from, traits as unknown as readonly [number, number, number, number, number, number]] });
  return send(p, from, addr, data);
}
export async function ownerUnpause(addr: Address) {
  const { p, from } = await connect();
  return send(p, from, addr, encodeFunctionData({ abi: ghostsAbi, functionName: "unpause" }));
}

// ---------- Ghost Shop: real YOUCOG purchases ----------
export const SHOP_FAUCET: Address = "0x3067ab541253746ab353b842fdc0970ffbde13c7";
const transferAbi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);
const WEI = 10n ** 18n; // YOUCOG decimals() = 18 (checked on-chain)

/** Read-only YOUCOG balance (whole tokens, floored) for a wallet. */
export async function youcogBalance(who: Address): Promise<number> {
  const b = await client.readContract({ address: YOUCOG, abi: erc20Abi, functionName: "balanceOf", args: [who] });
  return Number(b / WEI);
}
/** Connected wallet address without prompting, if the wallet already exposes one. */
export async function peekWallet(): Promise<Address | null> {
  const p = await getProvider();
  if (!p) return null;
  const a = (await p.request({ method: "eth_accounts" }).catch(() => [])) as string[];
  return (a?.[0] as Address) ?? null;
}
export async function ownedFromApi(who: Address): Promise<string[]> {
  const r = await fetch(`/api/shop?address=${who}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Couldn't load your items.");
  return j.owned as string[];
}
export type VerifyResult = { ok: true; owned: string[] } | { ok: false; pending?: boolean; error: string };
export async function verifyPurchaseApi(address: Address, itemId: string, txHash: Hex): Promise<VerifyResult> {
  try {
    const r = await fetch("/api/shop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address, itemId, txHash }) });
    const j = await r.json();
    return j.ok ? { ok: true, owned: j.owned } : { ok: false, pending: !!j.pending || r.status >= 500, error: j.error || "Verification failed." };
  } catch { return { ok: false, pending: true, error: "Couldn't reach the server. Tap retry." }; }
}
export type BuyStep = "connect" | "send" | "confirm" | "verify";
/** Sends transfer(faucet, price) from the user's wallet, waits for it, then asks the server to verify. */
export async function buyCosmetic(itemId: string, price: number, onStep: (s: BuyStep) => void, onHash?: (h: Hex, from: Address) => void): Promise<VerifyResult & { hash?: Hex }> {
  onStep("connect");
  const { p, from } = await connect();
  const amount = BigInt(price) * WEI;
  const [bal, eth] = await Promise.all([
    client.readContract({ address: YOUCOG, abi: erc20Abi, functionName: "balanceOf", args: [from] }),
    client.getBalance({ address: from }),
  ]);
  if (bal < amount) throw new Error(`Not enough YOUCOG. This costs ${price.toLocaleString("en-US")} and the wallet has ${Number(bal / WEI).toLocaleString("en-US")}.`);
  if (eth < 2_000_000_000_000n) throw new Error("Not enough ETH on Base for gas. Add a little ETH on Base and try again.");
  onStep("send");
  const data = encodeFunctionData({ abi: transferAbi, functionName: "transfer", args: [SHOP_FAUCET, amount] });
  const hash = (await p.request({ method: "eth_sendTransaction", params: [{ from, to: YOUCOG, data: withSuffix(data), value: "0x0" }] })) as Hex;
  onHash?.(hash, from);
  onStep("confirm");
  const rc = await client.waitForTransactionReceipt({ hash });
  if (rc.status !== "success") throw new Error("The transfer failed on-chain. No YOUCOG was spent (only gas).");
  onStep("verify");
  return { ...(await verifyPurchaseApi(from, itemId, hash)), hash };
}
