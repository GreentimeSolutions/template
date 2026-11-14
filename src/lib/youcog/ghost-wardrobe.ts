/**
 * Ghost wardrobe: pixel-art cosmetic layers for the 8-bit spy ghost,
 * drawn procedurally on a 32x32 grid.
 * COSMETICS are the on-chain YGHOST uint8[6] options (do not add mintable
 * items here without a contract change). CONTEST_COSMETICS are off-chain
 * only: wearable, savable, and usable as a home ghost, but never mintable.
 */
export const ghostWardrobeEnabled = () => import.meta.env.VITE_GHOST_LAB === "1";

export type Category = "hat" | "shades" | "skin" | "aura" | "trail" | "prop" | "bg";
export type Rarity = "common" | "rare" | "epic" | "legendary";
export type Cosmetic = { id: string; name: string; cat: Category; rarity: Rarity; c: string[]; kind: string; via?: "quest" | "buy"; contest?: true };
/** Quest-only items cannot be bought; buy-only cannot be earned; default is either. */
export const QUEST_ONLY: Record<string, string> = { "shades-red": "Forge 7-day streak", "aura-base": "Bridge quest (future)", "trail-code": "Collect 5 medals", "skin-glitch": "Find 3 glitch ghosts" };
export const BUY_ONLY = ["crown", "prop-duck", "party"];
export const QUESTS = [{ id: "streak7", name: "Claim 7 days in a row", reward: "shades-red" }];

/** Placeholder preview prices in YOUCOG; final prices are Andy's call. */
export const RARITY_PRICE: Record<Rarity, number> = { common: 100, rare: 500, epic: 2000, legendary: 10000 };
export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "hat", label: "Hats" }, { id: "shades", label: "Shades" }, { id: "skin", label: "Sheets" },
  { id: "aura", label: "Auras" }, { id: "trail", label: "Trails" }, { id: "prop", label: "Props" },
  { id: "bg", label: "Backdrops" },
];

const C = (id: string, name: string, cat: Category, rarity: Rarity, kind: string, ...c: string[]): Cosmetic => ({ id, name, cat, rarity, kind, c });
const K = (id: string, name: string, cat: Category, rarity: Rarity, kind: string, ...c: string[]): Cosmetic => ({ id, name, cat, rarity, kind, c, contest: true });

export const COSMETICS: Cosmetic[] = [
  C("fedora-white", "Spy Fedora", "hat", "common", "fedora", "#f4f4f4", "#1b1b2f"),
  C("fedora-red", "Red Fedora", "hat", "common", "fedora", "#d7263d", "#1b1b2f"),
  C("fedora-gold", "Gold Fedora", "hat", "epic", "fedora", "#f5b301", "#7a4b00"),
  C("beanie", "Beanie", "hat", "common", "beanie", "#3a86ff", "#ffffff"),
  C("tophat", "Top Hat", "hat", "rare", "tophat", "#151515", "#d7263d"),
  C("crown", "Pixel Crown", "hat", "legendary", "crown", "#f5b301", "#d7263d"),
  C("cap", "Backwards Cap", "hat", "common", "cap", "#2ec4b6", "#0b3d3a"),
  C("propeller", "Propeller Cap", "hat", "rare", "propeller", "#ff9f1c", "#3a86ff"),
  C("party", "Party Cone", "hat", "common", "party", "#ff5ac8", "#f5b301"),
  C("shades-black", "Spy Shades", "shades", "common", "shades", "#0d0d0d", "#4a4a4a"),
  C("shades-red", "Laser Visor", "shades", "rare", "visor", "#ff2a2a", "#ffb3b3"),
  C("shades-blue", "Ice Visor", "shades", "rare", "visor", "#3a86ff", "#bde0ff"),
  C("heart", "Heart Shades", "shades", "common", "heart", "#ff3d7f", "#ffd1e0"),
  C("3d", "3D Glasses", "shades", "common", "3d", "#ff2a2a", "#2ec4ff"),
  C("monocle", "Monocle", "shades", "epic", "monocle", "#f5b301", "#cfe8ff"),
  C("pixel", "Deal-With-It", "shades", "legendary", "pixel", "#0d0d0d", "#ffffff"),
  C("skin-classic", "Classic Sheet", "skin", "common", "skin", "#ffffff", "#c9d1e6"),
  C("skin-mint", "Mint Sheet", "skin", "common", "skin", "#c8f7dc", "#7fd1a8"),
  C("skin-lilac", "Lilac Sheet", "skin", "rare", "skin", "#e3d0ff", "#a98be0"),
  C("skin-trench", "Trench Coat", "skin", "epic", "trench", "#c49a6c", "#7a5533"),
  C("skin-tux", "Tuxedo", "skin", "rare", "tux", "#1b1b2f", "#ffffff"),
  C("skin-glitch", "Glitch Sheet", "skin", "legendary", "glitch", "#ffffff", "#2ec4ff", "#ff2a6d"),
  C("aura-none-blue", "Blue Glow", "aura", "common", "glow", "#3a86ff"),
  C("aura-gold", "Gold Glow", "aura", "rare", "glow", "#f5b301"),
  C("aura-fire", "Fire Ring", "aura", "epic", "ring", "#ff5a1f", "#f5b301"),
  C("aura-sparkle", "Sparkles", "aura", "rare", "sparkle", "#ffffff", "#f5b301"),
  C("aura-base", "Base Halo", "aura", "legendary", "halo", "#0052ff", "#9cc0ff"),
  C("trail-mist", "Mist Trail", "trail", "common", "mist", "#c9d1e6"),
  C("trail-rainbow", "Rainbow Trail", "trail", "epic", "rainbow", "#ff2a2a", "#ff9f1c", "#f5b301", "#2ec4b6", "#3a86ff"),
  C("trail-coins", "Coin Trail", "trail", "rare", "coins", "#f5b301", "#7a4b00"),
  C("trail-code", "Code Trail", "trail", "rare", "code", "#39ff14"),
  C("trail-flame", "Flame Trail", "trail", "legendary", "flame", "#ff5a1f", "#f5b301"),
  C("prop-briefcase", "Briefcase", "prop", "common", "briefcase", "#7a5533", "#f5b301"),
  C("prop-coffee", "Coffee", "prop", "common", "coffee", "#ffffff", "#6b3e1e"),
  C("prop-balloon", "Balloon", "prop", "common", "balloon", "#ff3d7f", "#ffffff"),
  C("prop-laptop", "Laptop", "prop", "rare", "laptop", "#9aa4bf", "#39ff14"),
  C("prop-wand", "Magic Wand", "prop", "epic", "wand", "#151515", "#f5b301"),
  C("prop-duck", "Rubber Duck", "prop", "rare", "duck", "#ffd60a", "#ff9f1c"),
];

/** Off-chain contest options. Not in the YGHOST contract; cannot be minted. */
export const CONTEST_COSMETICS: Cosmetic[] = [
  K("horns", "Devil Horns", "hat", "rare", "horns", "#d7263d", "#7a1020"),
  K("bandana", "Ninja Bandana", "hat", "common", "bandana", "#1b1b2f", "#d7263d"),
  K("flower", "Flower Crown", "hat", "rare", "flower", "#ff5ac8", "#f5b301"),
  K("antenna", "Alien Antenna", "hat", "epic", "antenna", "#39ff14", "#1b1b2f"),
  K("beret", "Artist Beret", "hat", "common", "beret", "#1b1b2f", "#d7263d"),
  K("eyes-star", "Star Eyes", "shades", "rare", "star", "#f5b301", "#fff3b0"),
  K("eyes-sleepy", "Sleepy Eyes", "shades", "common", "sleepy", "#1b1b2f", "#8892b0"),
  K("eyes-cyborg", "Cyborg Eye", "shades", "epic", "cyborg", "#4a4a4a", "#7dffd4"),
  K("eyes-sparkle", "Sparkle Eyes", "shades", "rare", "sparkle-eyes", "#3a86ff", "#ffffff"),
  K("eyes-cute", "Cute Eyes", "shades", "common", "cute", "#ffffff", "#ff5ac8"),
  K("skin-gold", "Gold Sheet", "skin", "epic", "skin", "#f5b301", "#7a4b00"),
  K("skin-void", "Void Sheet", "skin", "legendary", "void", "#1b0b2f", "#7c3aed", "#2ec4ff"),
  K("skin-neon", "Neon Sheet", "skin", "rare", "skin", "#39ff14", "#0b3d3a"),
  K("skin-sunset", "Sunset Sheet", "skin", "rare", "skin", "#ff8a5b", "#d7263d"),
  K("skin-camo", "Camo Sheet", "skin", "common", "camo", "#7fa36b", "#3d5c34", "#c4d4a8"),
  K("aura-lightning", "Lightning", "aura", "epic", "lightning", "#f5b301", "#ffffff"),
  K("aura-orbit", "Orbit Rings", "aura", "rare", "orbit", "#2ec4ff", "#f5b301"),
  K("aura-pixels", "Pixel Cloud", "aura", "common", "pixels", "#b15cff", "#3a86ff"),
  K("aura-hearts", "Heart Aura", "aura", "rare", "hearts", "#ff3d7f", "#ffd1e0"),
  K("trail-stars", "Star Trail", "trail", "rare", "stars", "#f5b301", "#ffffff"),
  K("trail-bubbles", "Bubble Trail", "trail", "common", "bubbles", "#9cc0ff", "#ffffff"),
  K("trail-bats", "Bat Trail", "trail", "epic", "bats", "#1b1b2f", "#4a4a4a"),
  K("trail-hearts", "Heart Trail", "trail", "common", "hearts", "#ff3d7f", "#ffd1e0"),
  K("prop-sword", "Pixel Sword", "prop", "rare", "sword", "#c9d1e6", "#f5b301"),
  K("prop-umbrella", "Umbrella", "prop", "common", "umbrella", "#3a86ff", "#1b1b2f"),
  K("prop-camera", "Spy Camera", "prop", "rare", "camera", "#2a2a3a", "#7dffd4"),
  K("prop-skate", "Skateboard", "prop", "common", "skate", "#1b1b2f", "#ff5ac8"),
  K("prop-flag", "Contest Flag", "prop", "epic", "flag", "#7c3aed", "#f5b301"),
  K("bg-night", "Night Sky", "bg", "common", "night", "#0b1028", "#f5f3ff"),
  K("bg-stars", "Starfield", "bg", "rare", "starfield", "#070b1c", "#f5b301"),
  K("bg-grid", "Cyber Grid", "bg", "rare", "grid", "#0d1230", "#3a86ff"),
  K("bg-sunset", "Sunset", "bg", "epic", "sunset", "#3a1c5c", "#ff9f1c"),
  K("bg-base", "Base Blue", "bg", "common", "base-bg", "#041c5c", "#0052ff"),
  K("bg-checker", "Checker", "bg", "common", "checker", "#111a44", "#2a3570"),
];

export const ALL_COSMETICS: Cosmetic[] = [...COSMETICS, ...CONTEST_COSMETICS];
const CONTEST_IDS = new Set(CONTEST_COSMETICS.map((c) => c.id));
export const isContestId = (id?: string | null): boolean => !!id && CONTEST_IDS.has(id);
export const byId = (id?: string | null) => ALL_COSMETICS.find((x) => x.id === id);
export type Outfit = Partial<Record<Category, string>>;
export const DEFAULT_OUTFIT: Outfit = { hat: "fedora-white", shades: "shades-black", skin: "skin-classic" };
export const DEFAULT_OWNED = ["fedora-white", "shades-black", "skin-classic"];

/** Combinations if each on-chain slot may also be empty. */
export const comboCount = () =>
  CATEGORIES.filter((k) => k.id !== "bg").reduce((n, k) => n * (COSMETICS.filter((x) => x.cat === k.id).length + 1), 1);

type P = (x: number, y: number, w: number, h: number, col: string) => void;

function body(p: P, ck: Cosmetic | undefined, t: number) {
  const [f, s, g] = ck?.c ?? ["#ffffff", "#c9d1e6"];
  const o = "#1b1b2f";
  // sheet silhouette: head dome rows 10-14, body 14-26, wavy hem 26-28
  const rows: [number, number][] = [[13, 6], [11, 10], [10, 12], [9, 14], [9, 14]];
  rows.forEach(([x, w], i) => { p(x - 1, 10 + i, w + 2, 1, o); p(x, 10 + i, w, 1, f); });
  for (let y = 15; y < 27; y++) { p(8, y, 16, 1, o); p(9, y, 14, 1, f); p(19, y, 4, 1, s); }
  const ph = Math.floor(t / 250) % 2;
  for (let i = 0; i < 4; i++) { p(9 + i * 4 + ph, 27, 2, 1, f); p(9 + i * 4 + ph, 28, 2, 1, o); }
  p(8, 9 + 18, 1, 1, o); p(23, 27, 1, 1, o);
  if (ck?.kind === "trench") { p(9, 19, 14, 8, f); p(15, 19, 2, 8, s); p(9, 21, 14, 1, s); p(12, 23, 1, 1, o); p(19, 23, 1, 1, o); }
  if (ck?.kind === "tux") { p(9, 18, 14, 9, f); p(14, 18, 4, 9, s); p(15, 18, 2, 1, "#d7263d"); p(15, 20, 2, 1, o); p(15, 22, 2, 1, o); }
  if (ck?.kind === "glitch" && g) { const k = Math.floor(t / 120) % 4; p(9 + k, 16 + k * 2, 6, 1, s); p(14 - k, 22 - k, 7, 1, g); }
  if (ck?.kind === "camo") { p(10, 16, 4, 3, s); p(16, 20, 5, 3, g ?? s); p(12, 23, 4, 2, s); p(18, 17, 3, 2, g ?? s); }
  if (ck?.kind === "void" && g) { p(11, 17, 3, 1, s); p(17, 21, 4, 1, g); p(13, 24, 2, 1, s); }
}

function hat(p: P, ck?: Cosmetic) {
  if (!ck) return;
  const [a, b] = ck.c, o = "#1b1b2f";
  switch (ck.kind) {
    case "fedora": p(7, 10, 18, 2, o); p(8, 10, 16, 1, a); p(11, 5, 10, 5, o); p(12, 5, 8, 4, a); p(12, 8, 8, 1, b); p(15, 5, 2, 1, b); break;
    case "beanie": p(10, 6, 12, 5, a); p(10, 9, 12, 2, b); p(15, 4, 2, 2, b); break;
    case "tophat": p(8, 10, 16, 1, a); p(11, 2, 10, 8, a); p(11, 8, 10, 1, b); break;
    case "crown": p(10, 6, 12, 4, a); p(10, 4, 2, 2, a); p(15, 3, 2, 3, a); p(20, 4, 2, 2, a); p(13, 7, 2, 2, b); p(18, 7, 2, 2, b); break;
    case "cap": p(10, 7, 12, 4, a); p(20, 9, 6, 2, b); p(15, 6, 2, 1, b); break;
    case "propeller": p(10, 7, 12, 4, a); p(15, 4, 2, 3, o); p(11, 3, 10, 1, b); break;
    case "pumpkin": p(9, 5, 14, 6, a); p(15, 3, 2, 2, b); p(12, 6, 1, 4, "#c25e00"); p(19, 6, 1, 4, "#c25e00"); break;
    case "witch": p(7, 10, 18, 1, a); p(11, 7, 10, 3, a); p(13, 4, 6, 3, a); p(15, 1, 3, 3, a); p(11, 9, 10, 1, b); break;
    case "santa": p(10, 7, 12, 3, a); p(13, 4, 7, 3, a); p(19, 3, 3, 2, a); p(22, 3, 2, 2, b); p(9, 10, 14, 1, b); break;
    case "party": p(14, 3, 4, 2, a); p(13, 5, 6, 2, b); p(12, 7, 8, 3, a); p(15, 1, 2, 2, b); break;
    case "horns": p(10, 6, 2, 3, a); p(9, 3, 2, 3, a); p(10, 4, 1, 1, b); p(20, 6, 2, 3, a); p(21, 3, 2, 3, a); p(21, 4, 1, 1, b); break;
    case "bandana": p(9, 9, 14, 3, a); p(9, 9, 14, 1, b); p(23, 9, 3, 2, a); p(25, 10, 2, 2, a); p(24, 8, 2, 1, b); break;
    case "flower":
      ([[11, 5], [16, 3], [21, 5]] as [number, number][]).forEach(([x, y], i) => {
        const col = i % 2 ? a : b;
        p(x, y, 1, 1, col); p(x - 1, y + 1, 3, 1, col); p(x, y + 2, 1, 1, col); p(x, y + 1, 1, 1, "#3d8c40");
      });
      break;
    case "antenna": p(12, 3, 1, 6, o); p(11, 1, 3, 2, a); p(19, 3, 1, 6, o); p(18, 1, 3, 2, a); break;
    case "beret": p(9, 7, 15, 3, a); p(8, 8, 16, 2, a); p(22, 6, 2, 2, b); break;
  }
}
function shades(p: P, ck: Cosmetic | undefined, t: number) {
  if (!ck) return;
  const [a, b] = ck.c;
  switch (ck.kind) {
    case "shades": p(10, 13, 12, 1, a); p(10, 14, 5, 3, a); p(17, 14, 5, 3, a); p(11, 14, 1, 1, b); p(18, 14, 1, 1, b); break;
    case "visor": p(9, 13, 14, 4, a); p(10 + (Math.floor(t / 90) % 12), 14, 2, 1, b); break;
    case "heart": [11, 18].forEach((x) => { p(x, 13, 1, 1, a); p(x + 2, 13, 1, 1, a); p(x - 1, 14, 5, 2, a); p(x, 16, 3, 1, a); p(x + 1, 17, 1, 1, a); p(x, 14, 1, 1, b); }); break;
    case "3d": p(10, 13, 12, 1, "#ffffff"); p(10, 14, 5, 3, a); p(17, 14, 5, 3, b); break;
    case "monocle": p(17, 13, 5, 5, a); p(18, 14, 3, 3, b); p(21, 18, 1, 6, a); p(12, 15, 3, 1, "#1b1b2f"); break;
    case "pixel": p(9, 13, 14, 1, a); for (let i = 0; i < 2; i++) { p(10 + i * 7, 14, 5, 2, a); p(10 + i * 7, 14, 1, 1, b); p(12 + i * 7, 15, 1, 1, b); } break;
    case "star": [11, 18].forEach((x) => { p(x + 1, 13, 1, 1, a); p(x, 14, 3, 1, a); p(x + 1, 15, 1, 1, a); p(x + 1, 14, 1, 1, b); }); break;
    case "sleepy": p(10, 15, 4, 1, a); p(11, 14, 1, 1, a); p(18, 15, 4, 1, a); p(20, 14, 1, 1, a); break;
    case "cyborg": p(12, 14, 2, 2, "#1b1b2f"); p(17, 13, 6, 5, a); p(18, 14, 4, 3, b); p(19, 15, 1, 1, "#ff2a2a"); break;
    case "sparkle-eyes": [11, 18].forEach((x) => { p(x, 13, 3, 4, a); p(x + 1, 14, 1, 1, b); p(x - 1, 13, 1, 1, b); }); break;
    case "cute": [11, 18].forEach((x) => { p(x, 13, 4, 4, a); p(x + 1, 14, 2, 2, "#1b1b2f"); p(x + 2, 14, 1, 1, b); }); break;
  }
}
function aura(p: P, ck: Cosmetic | undefined, t: number) {
  if (!ck) return;
  const [a, b] = ck.c, ph = Math.floor(t / 200) % 2;
  switch (ck.kind) {
    case "glow": for (let y = 7; y < 30; y += 2) { p(5 + ph, y, 1, 1, a); p(26 - ph, y, 1, 1, a); } for (let x = 7; x < 26; x += 2) p(x + ph, 30, 1, 1, a); break;
    case "ring": for (let i = 0; i < 16; i++) { const an = (i / 16) * Math.PI * 2 + t / 600; p(Math.round(16 + Math.cos(an) * 13), Math.round(18 + Math.sin(an) * 13), 1, 1, i % 2 ? a : b); } break;
    case "sparkle": [[4, 8], [27, 12], [5, 24], [26, 26], [16, 1]].forEach(([x, y], i) => { if ((Math.floor(t / 180) + i) % 3) { p(x, y, 1, 1, a); p(x - 1, y, 1, 1, b); p(x + 1, y, 1, 1, b); p(x, y - 1, 1, 1, b); p(x, y + 1, 1, 1, b); } }); break;
    case "snow": [[4, 4], [27, 9], [6, 18], [25, 21], [14, 1], [20, 5]].forEach(([x, y], i) => p(x, (y + Math.floor(t / 160) + i * 3) % 31, 1, 1, i % 2 ? a : b)); break;
    case "hearts": [[4, 10], [26, 14], [6, 24], [24, 26]].forEach(([x, y], i) => { const yy = y - ((Math.floor(t / 200) + i) % 3); p(x, yy, 1, 1, a); p(x + 2, yy, 1, 1, a); p(x - 1 + 1, yy + 1, 3, 1, a); p(x + 1, yy + 2, 1, 1, b); }); break;
    case "halo": p(11, 1 + ph, 10, 1, a); p(10, 2 + ph, 1, 1, a); p(21, 2 + ph, 1, 1, a); p(11, 3 + ph, 10, 1, b); break;
    case "lightning": p(4, 8, 1, 4, a); p(5, 12, 1, 3, a); p(4, 15, 1, 4, b ?? a); p(27, 10, 1, 4, a); p(26, 14, 1, 3, b ?? a); p(27, 17, 1, 4, a); break;
    case "orbit":
      for (let i = 0; i < 8; i++) {
        const an = (i / 8) * Math.PI * 2 + t / 500;
        p(Math.round(16 + Math.cos(an) * 14), Math.round(16 + Math.sin(an) * 11), 1, 1, a);
        p(Math.round(16 + Math.cos(-an) * 10), Math.round(16 + Math.sin(-an) * 8), 1, 1, b ?? a);
      }
      break;
    case "pixels": [[3, 10], [28, 8], [4, 22], [27, 20], [15, 2], [2, 16]].forEach(([x, y], i) => { if ((Math.floor(t / 200) + i) % 2) p(x, y, 2, 2, i % 2 ? a : (b ?? a)); }); break;
  }
}
function trail(p: P, ck: Cosmetic | undefined, t: number) {
  if (!ck) return;
  const sh = Math.floor(t / 150) % 3;
  switch (ck.kind) {
    case "mist": for (let i = 0; i < 3; i++) p(1 + i * 2 + (i + sh) % 2, 20 + i * 3, 4 - i, 1, ck.c[0]); break;
    case "rainbow": ck.c.forEach((col, i) => p(0, 17 + i, 8 - ((i + sh) % 2), 1, col)); break;
    case "coins": for (let i = 0; i < 3; i++) { const x = 1 + i * 2, y = 14 + ((i * 5 + sh * 3) % 12); p(x, y, 2, 2, ck.c[0]); p(x + 1, y + 1, 1, 1, ck.c[1]); } break;
    case "code": for (let i = 0; i < 4; i++) p(1 + (i % 2) * 3, 12 + ((i * 4 + sh * 2) % 16), 1, 2, ck.c[0]); break;
    case "flame": for (let i = 0; i < 4; i++) { p(0 + i, 22 - i * 2 - (sh % 2), 2, 2, ck.c[i % 2]); } break;
    case "stars": for (let i = 0; i < 3; i++) { const x = 1 + i * 2, y = 14 + ((i * 4 + sh * 3) % 12); p(x + 1, y, 1, 1, ck.c[0]); p(x, y + 1, 3, 1, ck.c[0]); p(x + 1, y + 2, 1, 1, ck.c[0]); p(x + 1, y + 1, 1, 1, ck.c[1] ?? "#ffffff"); } break;
    case "bubbles": for (let i = 0; i < 3; i++) { const x = 1 + i, y = 12 + ((i * 5 + sh * 2) % 14); p(x, y, 2, 2, ck.c[0]); p(x + 1, y, 1, 1, ck.c[1] ?? "#ffffff"); } break;
    case "bats": for (let i = 0; i < 3; i++) { const x = 1 + i * 2, y = 13 + ((i * 4 + sh * 2) % 12); p(x, y, 1, 1, ck.c[0]); p(x + 2, y, 1, 1, ck.c[0]); p(x + 1, y + 1, 1, 1, ck.c[0]); } break;
    case "hearts": for (let i = 0; i < 3; i++) { const x = 1 + i * 2, y = 14 + ((i * 5 + sh * 3) % 12); p(x, y, 1, 1, ck.c[0]); p(x + 2, y, 1, 1, ck.c[0]); p(x, y + 1, 3, 1, ck.c[0]); } break;
  }
}
function prop(p: P, ck?: Cosmetic) {
  if (!ck) return;
  const [a, b] = ck.c, o = "#1b1b2f";
  switch (ck.kind) {
    case "briefcase": p(23, 22, 7, 5, a); p(25, 21, 3, 1, o); p(26, 24, 1, 1, b); break;
    case "coffee": p(24, 20, 4, 6, a); p(24, 20, 4, 1, b); p(28, 22, 1, 2, a); p(25, 18, 1, 1, "#c9d1e6"); p(26, 17, 1, 1, "#c9d1e6"); break;
    case "balloon": p(25, 3, 5, 6, a); p(26, 4, 1, 1, b); p(27, 9, 1, 12, o); break;
    case "laptop": p(23, 20, 8, 5, a); p(24, 21, 6, 3, o); p(25, 22, 3, 1, b); p(22, 25, 10, 1, a); break;
    case "wand": p(24, 16, 1, 10, a); p(23, 14, 3, 1, b); p(24, 13, 1, 3, b); break;
    case "candy": p(23, 21, 7, 6, a); p(23, 20, 7, 1, b); p(25, 23, 1, 1, b); p(27, 23, 1, 1, b); p(25, 25, 3, 1, b); p(22, 18, 1, 3, b); p(30, 18, 1, 3, b); break;
    case "duck": p(24, 22, 6, 4, a); p(27, 19, 3, 3, a); p(30, 20, 1, 1, b); p(28, 20, 1, 1, o); break;
    case "sword": p(26, 12, 1, 12, a); p(25, 12, 3, 1, b); p(26, 24, 1, 2, o); break;
    case "umbrella": p(24, 6, 7, 3, a); p(25, 5, 5, 1, a); p(27, 9, 1, 14, b); break;
    case "camera": p(23, 20, 7, 5, a); p(25, 21, 3, 3, b); p(24, 19, 2, 1, o); break;
    case "skate": p(8, 29, 16, 2, a); p(10, 30, 2, 1, b); p(20, 30, 2, 1, b); break;
    case "flag": p(24, 10, 1, 16, o); p(25, 10, 6, 5, a); p(25, 12, 4, 1, b); break;
  }
}

function backdrop(p: P, ck: Cosmetic | undefined, t: number) {
  if (!ck) return;
  const [a, b] = ck.c;
  switch (ck.kind) {
    case "night": {
      p(0, 0, 32, 32, a);
      [[3, 4], [8, 2], [14, 6], [20, 3], [27, 5], [5, 10], [24, 9], [16, 1]].forEach(([x, y], i) => p(x, y, i % 3 === 0 ? 2 : 1, 1, b));
      break;
    }
    case "starfield": {
      p(0, 0, 32, 32, a);
      [[2, 3], [7, 1], [11, 5], [15, 2], [19, 7], [23, 1], [28, 4], [4, 12], [9, 16], [26, 11], [30, 14], [13, 9], [21, 18], [6, 22], [17, 13]].forEach(([x, y], i) => {
        if ((Math.floor(t / 220) + i) % 4) p(x, y, 1, 1, i % 2 ? b : "#ffffff");
      });
      break;
    }
    case "grid": {
      p(0, 0, 32, 32, a);
      for (let i = 0; i < 32; i += 4) { p(i, 0, 1, 32, b); p(0, i, 32, 1, b); }
      break;
    }
    case "sunset": {
      p(0, 0, 32, 10, a);
      p(0, 10, 32, 6, "#d7263d");
      p(0, 16, 32, 6, b);
      p(0, 22, 32, 10, "#1b1b2f");
      p(20, 14, 6, 6, "#ffd36a");
      p(21, 15, 4, 4, b);
      break;
    }
    case "base-bg": {
      p(0, 0, 32, 32, a);
      p(0, 0, 32, 1, b); p(0, 31, 32, 1, b); p(0, 0, 1, 32, b); p(31, 0, 1, 32, b);
      p(10, 22, 12, 2, b); p(14, 18, 4, 4, b);
      break;
    }
    case "checker": {
      for (let y = 0; y < 32; y += 4) for (let x = 0; x < 32; x += 4) p(x, y, 4, 4, ((x + y) / 4) % 2 ? a : b);
      break;
    }
  }
}

/** Paint one ghost frame through a pixel setter (canvas or an offscreen buffer). Character only; backdrops use paintBackground (no bob). */
export function paintGhost(p: P, outfit: Outfit, t = 0) {
  const g = (k: Category) => byId(outfit[k]);
  aura(p, g("aura"), t);
  trail(p, g("trail"), t);
  body(p, g("skin"), t);
  if (!g("shades")) { p(12, 14, 2, 2, "#1b1b2f"); p(18, 14, 2, 2, "#1b1b2f"); }
  shades(p, g("shades"), t);
  hat(p, g("hat"));
  prop(p, g("prop"));
}

/** Off-chain backdrop, painted in screen space (should not bob with the ghost). */
export function paintBackground(p: P, outfit: Outfit, t = 0) {
  backdrop(p, byId(outfit.bg), t);
}

/** Same background as the Lab stage, used for saved / hosted / home-card portraits. */
export const LAB_GHOST_BG = "#111a44";
/** Scale used by Save image (32 * 16 = 512px). */
export const LAB_SAVE_PX = 16;

/** Draw the ghost + outfit at time t (ms). Grid is 32x32, scaled by px. */
export function drawGhost(ctx: CanvasRenderingContext2D, outfit: Outfit, t = 0, px = 6, bg?: string) {
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 32 * px, 32 * px);
  } else {
    ctx.clearRect(0, 0, 32 * px, 32 * px);
  }
  const pBg: P = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x * px, y * px, w * px, h * px); };
  paintBackground(pBg, outfit, t);
  const bob = Math.round(Math.sin(t / 400));
  const p: P = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(x * px, (y + bob) * px, w * px, h * px); };
  paintGhost(p, outfit, t);
}
