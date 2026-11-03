import { useState } from "react";
import { DEFAULT_OUTFIT, DEFAULT_OWNED, type Outfit } from "@/lib/youcog/ghost-wardrobe";
import { STORE_ITEMS, STORE_TABS, itemsForTab, simulateBuy, type StoreItem, type StoreTab } from "@/lib/youcog/cosmetics-store";
import { GhostCanvas } from "./ghost-wardrobe";

const RC: Record<string, string> = { common: "#8892b0", rare: "#3a86ff", epic: "#b15cff", legendary: "#f5b301" };
const fmt = (n: number) => n.toLocaleString("en-US");

/** Cosmetics store, PREVIEW ONLY: mock balance, simulated purchases, no wallet or token calls. */
export function CosmeticsStore({ startBalance = 15000 }: { startBalance?: number }) {
  const [tab, setTab] = useState<StoreTab>("hats");
  const [owned, setOwned] = useState<string[]>(DEFAULT_OWNED);
  const [equipped, setEquipped] = useState<Outfit>(DEFAULT_OUTFIT);
  const [tryOn, setTryOn] = useState<StoreItem | null>(null);
  const [sheet, setSheet] = useState<StoreItem | null>(null);
  const [bal, setBal] = useState(startBalance);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (s: string) => { setToast(s); setTimeout(() => setToast(null), 1600); };
  const shown: Outfit = tryOn ? { ...equipped, [tryOn.cat]: tryOn.id } : equipped;
  const sel = tryOn;
  const equip = (it: StoreItem) => { setEquipped((o) => ({ ...o, [it.cat]: o[it.cat] === it.id ? undefined : it.id })); setTryOn(null); flash(equipped[it.cat] === it.id ? `Took off ${it.name}` : `Equipped ${it.name}`); };
  const buy = (it: StoreItem) => {
    const r = simulateBuy(it, bal, owned);
    setSheet(null);
    if (!r.ok) return flash(r.reason === "insufficient" ? "Not enough preview YOUCOG" : r.reason === "owned" ? "Already owned" : "Earn this in Forge quests");
    setBal(r.balance); setOwned(r.owned); flash(`Bought ${it.name} (preview)`);
  };

  return (
    <div data-testid="cosmetics-store" style={{ color: "#fff", fontFamily: "ui-monospace,monospace", maxWidth: 390, margin: "0 auto", padding: "8px 14px 120px" }}>
      <div data-testid="preview-banner" style={{ textAlign: "center", fontSize: 10, letterSpacing: ".08em", color: "#0a0f2c", background: "#f5b301", borderRadius: 6, padding: "4px 6px", fontWeight: 700 }}>PREVIEW: NO REAL YOUCOG SPENT</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <a href="/lab" style={{ color: "#9cc0ff", fontSize: 11, textDecoration: "none" }}>‹ Lab</a>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: ".1em" }}>GHOST SHOP</div>
        <div data-testid="balance" style={{ fontSize: 11, color: "#f5b301" }}>{fmt(bal)} YOUCOG*</div>
      </div>
      <div style={{ position: "relative", display: "flex", justifyContent: "center", margin: "8px 0", background: "#111a44", border: `1px solid ${sel ? RC[sel.rarity] : "#2a3570"}`, borderRadius: 14 }}>
        <GhostCanvas outfit={shown} px={6} />
        <div style={{ position: "absolute", left: 8, top: 6, fontSize: 9, color: sel ? RC[sel.rarity] : "#8892b0" }}>{sel ? `TRYING ON · ${sel.rarity.toUpperCase()}` : "EQUIPPED"}</div>
      </div>
      {sel && (
        <div data-testid="tryon-bar" style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
          <div style={{ flex: 1, fontSize: 11 }}><b>{sel.name}</b><div style={{ color: "#8892b0", fontSize: 9 }}>{sel.questOnly ? `🔒 Earn in Forge quests: ${sel.questOnly}` : owned.includes(sel.id) ? "Owned" : `${fmt(sel.price)} YOUCOG`}</div></div>
          {owned.includes(sel.id) ? <button data-testid="equip" onClick={() => equip(sel)} style={btn("#39ff14", "#0a0f2c")}>{equipped[sel.cat] === sel.id ? "UNEQUIP" : "EQUIP"}</button>
            : sel.questOnly ? <div style={{ fontSize: 9, color: "#f5b301", border: "1px solid #f5b301", borderRadius: 8, padding: "6px 8px" }}>QUEST ONLY</div>
            : <button data-testid="buy" onClick={() => setSheet(sel)} style={btn("#0052ff", "#fff")}>BUY</button>}
          <button onClick={() => setTryOn(null)} style={btn("#2a3570", "#fff")}>✕</button>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
        {STORE_TABS.map((t) => (
          <button key={t.id} data-tab={t.id} onClick={() => setTab(t.id)} style={{ padding: "7px 0", fontSize: 11, borderRadius: 8, border: "1px solid #2a3570", background: tab === t.id ? "#f5b301" : "#111a44", color: tab === t.id ? "#0a0f2c" : "#fff" }}>{t.icon} {t.label}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 10 }}>
        {itemsForTab(tab).map((c) => {
          const have = owned.includes(c.id), on = equipped[c.cat] === c.id, trying = tryOn?.id === c.id;
          return (
            <button key={c.id} data-item={c.id} onClick={() => setTryOn(trying ? null : c)} style={{ position: "relative", padding: 4, borderRadius: 10, border: `2px solid ${trying ? "#fff" : RC[c.rarity]}`, background: `linear-gradient(180deg, ${RC[c.rarity]}33, #111a44 60%)`, color: "#fff", fontSize: 9 }}>
              {c.questOnly && !have && <span style={{ position: "absolute", right: 3, top: 3, fontSize: 8, background: "#f5b301", color: "#0a0f2c", borderRadius: 4, padding: "0 3px" }}>🔒 QUEST</span>}
              {c.buyOnly && !have && <span style={{ position: "absolute", left: 3, top: 3, fontSize: 8, color: "#9cc0ff" }}>SHOP</span>}
              <GhostCanvas outfit={{ skin: "skin-classic", [c.cat]: c.id }} px={2} />
              <div>{c.name}</div>
              <div style={{ color: RC[c.rarity] }}>{on ? "EQUIPPED" : have ? "OWNED" : c.questOnly ? "Earn in quests" : `${fmt(c.price)}`}</div>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 9, color: "#8892b0", marginTop: 10, textAlign: "center", lineHeight: 1.5 }}>
        *Mock preview balance. Cosmetics are just for fun and have no cash value. Prices are placeholders. Shop-only seasonal items aren't mintable traits yet.
      </div>
      {sheet && (
        <div onClick={() => setSheet(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end" }}>
          <div data-testid="buy-sheet" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 390, margin: "0 auto", background: "#111a44", borderTop: `3px solid ${RC[sheet.rarity]}`, borderRadius: "16px 16px 0 0", padding: 16 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <GhostCanvas outfit={{ ...equipped, [sheet.cat]: sheet.id }} px={3} />
              <div><div style={{ fontWeight: 700 }}>{sheet.name}</div><div style={{ color: RC[sheet.rarity], fontSize: 11 }}>{sheet.rarity}</div>
                <div style={{ fontSize: 18, marginTop: 4 }}>{fmt(sheet.price)} YOUCOG</div></div>
            </div>
            <div style={{ fontSize: 11, color: "#c9d1e6", marginTop: 10, lineHeight: 1.5 }}>The YOUCOG you spend goes back to the faucet, so other people can claim it.</div>
            <div style={{ fontSize: 11, color: "#f5b301", marginTop: 6 }}>Preview: no real YOUCOG spent. Balance after: {fmt(bal - sheet.price)}*</div>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setSheet(null)} style={{ ...btn("#2a3570", "#fff"), flex: 1, padding: 12 }}>CANCEL</button>
              <button data-testid="confirm-buy" onClick={() => buy(sheet)} disabled={bal < sheet.price} style={{ ...btn("#0052ff", "#fff"), flex: 2, padding: 12 }}>{bal < sheet.price ? "NOT ENOUGH" : "CONFIRM (PREVIEW)"}</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div style={{ position: "fixed", left: 20, right: 20, bottom: 30, background: "#1b1b2f", border: "1px solid #f5b301", borderRadius: 10, padding: 10, fontSize: 11, textAlign: "center" }}>{toast}</div>}
    </div>
  );
}
const btn = (bg: string, fg: string) => ({ background: bg, color: fg, border: 0, borderRadius: 8, padding: "8px 12px", fontSize: 11, fontWeight: 700, fontFamily: "inherit" }) as const;
export const STORE_COUNT = STORE_ITEMS.length;
