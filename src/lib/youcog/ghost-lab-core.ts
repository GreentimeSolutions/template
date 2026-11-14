/**
 * Ghost Lab pure helpers (no browser, no network) so they can be unit-tested.
 * Trait encoding mirrors YoucogGhosts.sol: slots 0 hat, 1 shades, 2 sheet, 3 aura, 4 trail, 5 prop;
 * value 0 = none/default, k = k-th item of that category in COSMETICS order (gen/gen.ts @22c3bca).
 */
import { ALL_COSMETICS, COSMETICS, isContestId, type Category, type Outfit } from "./ghost-wardrobe";

/** Equip or unequip a cosmetic for a local try-on. Ownership is not required. */
export function toggleOutfitItem(outfit: Outfit, id: string): Outfit {
  const c = ALL_COSMETICS.find((x) => x.id === id);
  if (!c) return outfit;
  if (outfit[c.cat] === id) {
    const next = { ...outfit };
    delete next[c.cat];
    return next;
  }
  return { ...outfit, [c.cat]: id };
}

export const SLOT_ORDER: Category[] = ["hat", "shades", "skin", "aura", "trail", "prop"];
/** On-chain option counts per slot; must equal the contract's GhostRenderer.slotCount. */
export const CONTRACT_SLOT_COUNTS = [9, 7, 6, 5, 5, 6] as const;
export const MAX_SUPPLY = 1000;
export const OWNER_RESERVE = 10;

export const itemsOf = (k: Category) => COSMETICS.filter((c) => c.cat === k);

export function outfitToTraits(o: Outfit): number[] {
  return SLOT_ORDER.map((k) => {
    const id = o[k];
    if (!id) return 0;
    if (isContestId(id)) throw new Error(`Contest-only ${k} cannot be minted`);
    const i = itemsOf(k).findIndex((c) => c.id === id);
    if (i < 0) throw new Error(`Unknown ${k} item: ${id}`);
    return i + 1;
  });
}

export function traitsToOutfit(t: readonly number[]): Outfit {
  const o: Outfit = {};
  SLOT_ORDER.forEach((k, s) => { if (t[s]) o[k] = itemsOf(k)[t[s] - 1]?.id; });
  return o;
}

export type LabChain = { paused: boolean; totalSupply: number; reserveMinted: number; hasMinted: boolean; price: bigint };
export type LabStatus = "paused" | "not-started" | "sold-out" | "already-minted" | "open";

/** Same order of checks as YoucogGhosts.mint(). */
export function labStatus(c: LabChain): LabStatus {
  if (c.paused) return "paused";
  if (c.totalSupply === 0) return "not-started";
  if (c.hasMinted) return "already-minted";
  if (c.totalSupply + (OWNER_RESERVE - c.reserveMinted) >= MAX_SUPPLY) return "sold-out";
  return "open";
}

/** Public mints still available (owner reserve held back). */
export const publicLeft = (c: Pick<LabChain, "totalSupply" | "reserveMinted">) =>
  Math.max(0, MAX_SUPPLY - c.totalSupply - (OWNER_RESERVE - c.reserveMinted));

/** Mints still available: max supply minus minted (floored at 0). */
export const mintsLeft = (max: number, minted: number) => Math.max(0, max - minted);

/** Free mints still available: freeUntil - totalSupply (floored at 0). */
export const freeLeft = (freeUntil: number, totalSupply: number) =>
  Math.max(0, freeUntil - totalSupply);

/** JSON shape of GET /api/ghosts-supply (priceWei is a decimal string). */
export type GhostsSupplyJson = {
  minted: number;
  max: number;
  left: number;
  freeUntil: number;
  freeLeft: number;
  priceWei: string;
};

/** Same YOUCOG formatting as the Ghost Lab mint button. */
export function formatYoucogPrice(priceWei: bigint): string {
  if (priceWei === 0n) return "Free (gas only)";
  return `${(Number(priceWei / 10n ** 14n) / 1e4).toLocaleString()} YOUCOG`;
}

export type GhostsMintLines =
  | { ok: false }
  | { ok: true; remaining: string; feeLine: string | null; priceLine: string | null };

/** Home mint-tile copy from a supply read. Invalid input -> fallback "Mint". */
export function ghostsMintLines(s: GhostsSupplyJson | null | undefined): GhostsMintLines {
  if (!s || !Number.isFinite(s.max) || s.max <= 0 || !Number.isFinite(s.left)) {
    return { ok: false };
  }
  const remaining = `${s.left}/${s.max}`;
  let priceWei: bigint;
  try {
    priceWei = BigInt(s.priceWei);
  } catch {
    return { ok: false };
  }
  if (priceWei === 0n) {
    return { ok: true, remaining, feeLine: "Just pay a small gas fee", priceLine: null };
  }
  return { ok: true, remaining, feeLine: null, priceLine: formatYoucogPrice(priceWei) };
}

export function ghostsMintAria(lines: GhostsMintLines): string {
  if (!lines.ok) return "Mint a ghost";
  const parts = [`Mint a ghost, ${lines.remaining} remaining`];
  if (lines.feeLine) parts.push(lines.feeLine);
  if (lines.priceLine) parts.push(lines.priceLine);
  return parts.join(", ");
}

/** tokenURI is data:application/json;base64,... with an SVG data-URI image. */
export function decodeTokenUri(uri: string): { name: string; image: string } {
  const p = "data:application/json;base64,";
  if (!uri.startsWith(p)) throw new Error("Unexpected tokenURI format");
  const json = typeof atob === "function" ? atob(uri.slice(p.length)) : Buffer.from(uri.slice(p.length), "base64").toString("utf8");
  const j = JSON.parse(json) as { name: string; image: string };
  return { name: j.name, image: j.image };
}


export const WEAR_SLOTS: Category[] = [...SLOT_ORDER, "bg"];

/** True if the outfit includes any off-chain contest item (including a backdrop). */
export function hasContestItems(o: Outfit): boolean {
  return WEAR_SLOTS.some((k) => isContestId(o[k]));
}

/** Drop contest-only items; on-chain pieces stay. */
export function stripContestItems(o: Outfit): Outfit {
  const next: Outfit = { ...o };
  for (const k of WEAR_SLOTS) {
    if (isContestId(next[k])) delete next[k];
  }
  return next;
}

/** Parse `1,1,1,0,0,0` or `1-1-1-0-0-0` into on-chain trait values, or null if invalid. */
export function parseTraitsParam(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  const parts = raw.trim().split(/[,\-]/);
  if (parts.length !== CONTRACT_SLOT_COUNTS.length) return null;
  const t: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (!/^\d+$/.test(parts[i])) return null;
    const n = Number(parts[i]);
    if (!Number.isInteger(n) || n < 0 || n > CONTRACT_SLOT_COUNTS[i]) return null;
    t.push(n);
  }
  return t;
}

/** Comma-separated cosmetic ids, one per worn slot. Unknown or duplicate categories -> null. */
export function parseWearParam(raw: string | null | undefined): Outfit | null {
  if (!raw || !raw.trim()) return null;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const o: Outfit = {};
  for (const id of ids) {
    const c = ALL_COSMETICS.find((x) => x.id === id);
    if (!c) return null;
    if (o[c.cat]) return null;
    o[c.cat] = id;
  }
  return o;
}

export function wearFromOutfit(o: Outfit): string {
  return WEAR_SLOTS.map((k) => o[k]).filter(Boolean).join(",");
}

/** Compact pfp / URL encoding: `traits:1,1,1,0,0,0` when mintable, otherwise `wear:id,id`. */
export function encodeLabOutfit(o: Outfit): string {
  if (!hasContestItems(o)) return `traits:${outfitToTraits(o).join(",")}`;
  return `wear:${wearFromOutfit(o)}`;
}

export function decodeLabOutfit(value: string | null | undefined): Outfit | null {
  if (!value) return null;
  if (value.startsWith("traits:")) {
    const t = parseTraitsParam(value.slice("traits:".length));
    return t ? traitsToOutfit(t) : null;
  }
  if (value.startsWith("wear:")) return parseWearParam(value.slice("wear:".length));
  // bare traits query or wear list
  const t = parseTraitsParam(value);
  if (t) return traitsToOutfit(t);
  return parseWearParam(value);
}

export function labGhostPath(o: Outfit, px?: number): string {
  const q = new URLSearchParams();
  if (hasContestItems(o)) q.set("wear", wearFromOutfit(o));
  else q.set("traits", outfitToTraits(o).join(","));
  if (px && px !== 16) q.set("px", String(px));
  return `/api/ghost-image?${q}`;
}
