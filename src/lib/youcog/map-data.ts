/** Read-only ecosystem map (/map). Facts only from the repo, docs and confirmed history. */
export type MapNode = { id: string; title: string; text?: string; href?: string; children?: MapNode[] };

export const MAP_TREE: MapNode = {
  id: "root", title: "Youcognito", text: "Farcaster Mini App on Base · youcognito.com", href: "/",
  children: [
    { id: "research", title: "Private AI research", text: "Youcog reads the web in sealed tabs; the session lives in memory.", children: [
      { id: "sealed", title: "Sealed tabs", text: "Pages load through a proxy. Scripts never run." },
      { id: "burn", title: "Burn", text: "Ends the session. Nothing is written down." },
      { id: "deep", title: "Deep Mission", text: "Unlocked by holding 10M YOUCOG (Hold 10M tile)." },
    ] },
    { id: "youcog", title: "YOUCOG token", text: "CA 0x92Bff5D88157114DfC4a0A00F3496AA7e2E7EbA3", children: [
      { id: "bankr", title: "Official on @bankr", text: "Trade page on bankr.bot", href: "https://bankr.bot/terminal/trade?out=0x92bff5d88157114dfc4a0a00f3496aa7e2e7eba3&chain=base" },
    ] },
    { id: "faucet", title: "Daily faucet", text: "Daily YOUCOG gift while supplies last.", href: "/", children: [
      { id: "streaks", title: "Streaks & streak flames", text: "Streak counter with flame tiers." },
      { id: "ycurv-bonus", title: "YCURV holder bonus", text: "Extra on claims for YCURV holders." },
      { id: "forge", title: "Forge quests", text: "Claim streaks and purchases unlock quest-only cosmetics." },
    ] },
    { id: "lab", title: "Ghost Lab", text: "Dress your ghost and mint 1 of 1,000.", href: "/lab", children: [
      { id: "ghosts", title: "YoucogGhosts", text: "1,000 ERC-721 · first 100 free · deployed & verified by @bankrbot · 0x298b…7bf1a" },
      { id: "shop", title: "Ghost Shop", text: "Cosmetics bought with YOUCOG, which goes back to the faucet. Quest rewards are quest-only.", href: "/lab/shop" },
      { id: "gear", title: "Sports & seasonal gear", text: "Shop-only helmets (generic colors), jersey, scarves, caps, hockey mask, crowns and sun hat.", href: "/lab/shop" },
      { id: "medal", title: "Founder's Medal", text: "1/1 ERC-721 (YCFOUNDER) · 0xb4c4…8d5d" },
    ] },
    { id: "ycurv", title: "YCURV", text: "Youcog Curve · Mint Club bonding curve, paid in YOUCOG · 0xB62C395519f0D51A637a5cc73C1819b71BfB6984", href: "/curve", children: [
      { id: "mintclub", title: "Mint Club page", href: "https://mint.club/token/base/YCURV" },
      { id: "stake", title: "Stake (preview)", text: "View-only page.", href: "/stake" },
    ] },
    { id: "tiles", title: "Home tiles", children: [
      { id: "run", title: "Run", text: "Youcognito Run game" },
      { id: "music", title: "Music", text: "Youcognito theme soundtrack" },
      { id: "short", title: "Short", text: "Youcognito Short video" },
      { id: "play", title: "Play", href: "/play" },
    ] },
    { id: "looks", title: "Looks & easter eggs", children: [
      { id: "themes", title: "Seasonal modes", text: "Ghost (default), Autumn, Winter, Spring, Summer, Football. Saved on your device." },
      { id: "eggs", title: "Tap anywhere", text: "Easter eggs and new features show up year round." },
    ] },
    { id: "dao", title: "nito DAO", text: "Governance; details after review." },
    { id: "community", title: "Community", children: [
      { id: "x", title: "X @Youcognito", href: "https://x.com/Youcognito" },
      { id: "tg", title: "Telegram", href: "https://t.me/Youcognito" },
      { id: "fc", title: "Farcaster", href: "https://farcaster.xyz/greentime1" },
      { id: "lt", title: "Linktree", href: "https://linktr.ee/youcognito" },
      { id: "docs", title: "Docs (GitBook)", href: "https://youcognito.gitbook.io/youcognito-docs/" },
    ] },
  ],
};

export type Placed = { id: string; node: MapNode; x: number; y: number; parent?: string };
/** Left-to-right tree: depth -> x, leaves stacked -> y. */
export function layoutTree(root: MapNode, colW = 300, rowH = 135): Placed[] {
  const out: Placed[] = [];
  let row = 0;
  const walk = (n: MapNode, depth: number, parent?: string): number => {
    const kids = n.children ?? [];
    let y: number;
    if (!kids.length) y = row++ * rowH;
    else { const ys = kids.map((k) => walk(k, depth + 1, n.id)); y = (ys[0] + ys[ys.length - 1]) / 2; }
    out.push({ id: n.id, node: n, x: depth * colW, y, parent });
    return y;
  };
  walk(root, 0);
  return out;
}
