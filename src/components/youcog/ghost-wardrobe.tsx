import { useEffect, useRef, useState } from "react";
import { CATEGORIES, COSMETICS, DEFAULT_OUTFIT, DEFAULT_OWNED, RARITY_PRICE, comboCount, drawGhost, QUEST_ONLY, QUESTS, type Category, type Outfit } from "@/lib/youcog/ghost-wardrobe";

const RC: Record<string, string> = { common: "#8892b0", rare: "#3a86ff", epic: "#b15cff", legendary: "#f5b301" };
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function GhostCanvas({ outfit, px = 8 }: { outfit: Outfit; px?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    if (reduced()) { drawGhost(ctx, outfit, 0, px); return; }
    let id = 0;
    const f = (now: number) => { drawGhost(ctx, outfit, now, px); id = requestAnimationFrame(f); };
    id = requestAnimationFrame(f);
    return () => cancelAnimationFrame(id);
  }, [outfit, px]);
  return <canvas ref={ref} width={32 * px} height={32 * px} style={{ imageRendering: "pixelated", width: 32 * px, height: 32 * px }} />;
}

/** PREVIEW ONLY: balance, purchases and mint are simulated locally. */
export function GhostWardrobe({ startBalance = 15000 }: { startBalance?: number }) {
  const [cat, setCat] = useState<Category>("hat");
  const [outfit, setOutfit] = useState<Outfit>(DEFAULT_OUTFIT);
  const [owned, setOwned] = useState<string[]>(DEFAULT_OWNED);
  const [bal, setBal] = useState(startBalance);
  const [toast, setToast] = useState<string | null>(null);
  const [mint, setMint] = useState<null | "minting" | number>(null);
  const flash = (s: string) => { setToast(s); setTimeout(() => setToast(null), 1400); };

  const tap = (id: string) => {
    const c = COSMETICS.find((x) => x.id === id)!;
    if (outfit[c.cat] === id) return setOutfit({ ...outfit, [c.cat]: undefined });
    if (!owned.includes(id) && QUEST_ONLY[id]) return flash(`Quest-only: ${QUEST_ONLY[id]}`);
    if (!owned.includes(id)) {
      const price = RARITY_PRICE[c.rarity];
      if (bal < price) return flash("Not enough YOUCOG (simulated)");
      setBal(bal - price); setOwned([...owned, id]); flash(`Bought ${c.name} · -${price} YOUCOG (simulated)`);
    }
    setOutfit({ ...outfit, [c.cat]: id });
  };
  const quest = () => { const q = QUESTS[0]; const c = COSMETICS.find((x) => x.id === q.reward)!; setOwned((o) => [...o, c.id]); setOutfit((o) => ({ ...o, [c.cat]: c.id })); setCat(c.cat); flash(`QUEST COMPLETE: ${q.name} · unlocked ${c.name} (simulated)`); };
  const doMint = () => { setMint("minting"); setTimeout(() => setMint(1), 2200); };

  return (
    <div data-testid="ghost-wardrobe" style={{ color: "#fff", fontFamily: "ui-monospace,monospace", maxWidth: 390, margin: "0 auto", padding: "8px 14px 20px" }}>
      <div style={{ textAlign: "center", fontSize: 10, letterSpacing: ".2em", color: "#f5b301" }}>PREVIEW · SIMULATED PURCHASES</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: ".1em" }}>GHOST WARDROBE</div>
        <div data-testid="bal" style={{ fontSize: 12, color: "#f5b301" }}>{bal.toLocaleString()} YOUCOG</div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", margin: "10px 0", background: "#111a44", border: "1px solid #2a3570", borderRadius: 14 }}>
        <GhostCanvas outfit={outfit} px={8} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {CATEGORIES.map((k) => (
          <button key={k.id} data-cat={k.id} onClick={() => setCat(k.id)} style={{ flex: "1 0 28%", padding: "6px 0", fontSize: 11, borderRadius: 8, border: "1px solid #2a3570", background: cat === k.id ? "#f5b301" : "#111a44", color: cat === k.id ? "#0a0f2c" : "#fff" }}>{k.label}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 10 }}>
        {COSMETICS.filter((x) => x.cat === cat).map((c) => {
          const on = outfit[c.cat] === c.id, have = owned.includes(c.id);
          return (
            <button key={c.id} data-item={c.id} onClick={() => tap(c.id)} style={{ padding: 4, borderRadius: 10, border: `2px solid ${on ? "#f5b301" : "#2a3570"}`, background: "#111a44", color: "#fff", fontSize: 9 }}>
              <GhostCanvas outfit={{ skin: "skin-classic", [c.cat]: c.id }} px={2} />
              <div>{c.name}</div>
              <div style={{ color: RC[c.rarity] }}>{have ? (on ? "WEARING" : "OWNED") : QUEST_ONLY[c.id] ? "QUEST" : `${RARITY_PRICE[c.rarity]} · ${c.rarity}`}</div>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: "#8892b0", marginTop: 8, textAlign: "center" }}>{COSMETICS.length} sample items · {comboCount().toLocaleString()} possible ghosts</div>
      <button data-testid="quest" onClick={quest} disabled={owned.includes(QUESTS[0].reward)} style={{ width: "100%", marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid #f5b301", background: "#111a44", color: "#f5b301", fontSize: 11, letterSpacing: ".1em" }}>FORGE QUEST: {QUESTS[0].name.toUpperCase()} (SIMULATE)</button>
      <button data-testid="mint" onClick={doMint} style={{ width: "100%", marginTop: 10, padding: 12, borderRadius: 12, border: 0, background: "#0052ff", color: "#fff", fontWeight: 700, letterSpacing: ".15em" }}>MINT 1/1000</button>
      {toast && <div style={{ position: "fixed", left: 20, right: 20, bottom: 30, background: "#1b1b2f", border: "1px solid #f5b301", borderRadius: 10, padding: 10, fontSize: 11, textAlign: "center" }}>{toast}</div>}
      {mint !== null && (
        <div onClick={() => mint !== "minting" && setMint(null)} style={{ position: "fixed", inset: 0, background: "rgba(10,15,44,.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <GhostCanvas outfit={outfit} px={7} />
          <div style={{ marginTop: 14, fontSize: 12, letterSpacing: ".3em", color: "#f5b301" }}>{mint === "minting" ? "MINTING ON BASE…" : "MINTED (SIMULATED)"}</div>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: ".15em" }}>{mint === "minting" ? "…" : `GHOST #${mint} / 1000`}</div>
          <div style={{ fontSize: 10, color: "#8892b0", marginTop: 20 }}>Preview only. No transaction was sent.</div>
        </div>
      )}
    </div>
  );
}
