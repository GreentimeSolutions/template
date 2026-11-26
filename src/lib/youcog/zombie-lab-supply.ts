/** Pure helpers for the home Zombie Lab mint counter. */

export type ZombieLabSupplyJson = {
  left: number;
  max: number;
};

export type ZombieLabMintLines =
  | { ok: false }
  | { ok: true; remaining: string; feeLine: string };

function isCount(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && Number.isInteger(n);
}

export function parseZombieLabSupply(d: unknown): ZombieLabSupplyJson | null {
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  if (!isCount(o.left) || !isCount(o.max) || o.max <= 0 || o.left > o.max) return null;
  return { left: o.left, max: o.max };
}

export function zombieLabMintLines(s: ZombieLabSupplyJson | null | undefined): ZombieLabMintLines {
  if (!s) return { ok: false };
  const remaining = `${s.left.toLocaleString("en-US")}/${s.max.toLocaleString("en-US")}`;
  return { ok: true, remaining, feeLine: "Just pay a small gas fee to mint a pack" };
}

export function zombieLabMintAria(lines: ZombieLabMintLines): string {
  if (!lines.ok) return "Mint a Zombie Lab pack";
  return `Mint a Zombie Lab pack, ${lines.remaining} remaining, ${lines.feeLine}`;
}
