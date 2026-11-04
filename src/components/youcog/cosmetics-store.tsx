import { useEffect, useState } from "react";
import { EMPTY_SIGNALS, QUESTS, QUEST_FOR_ITEM, QUEST_REWARD_IDS, progress, type Signals } from "@/lib/youcog/quests-core";
import { DEFAULT_OUTFIT, DEFAULT_OWNED, type Outfit } from "@/lib/youcog/ghost-wardrobe";
import { STORE_ITEMS, STORE_TABS, itemsForTab, type StoreItem, type StoreTab } from "@/lib/youcog/cosmetics-store";
import { buyCosmetic, connect, friendlyError, ownedFromApi, peekWallet, verifyPurchaseApi, youcogBalance, type BuyStep } from "@/lib/youcog/ghost-lab";
import type { Address, Hex } from "viem";
import { GhostCanvas } from "./ghost-wardrobe";

const RC: Record<string, string> = { common: "#8892b0", rare: "#3a86ff", epic: "#b15cff", legendary: "#f5b301" };
const fmt = (n: number) => n.toLocaleString("en-US");

const BUY_STEP: Record<BuyStep, string> = { connect: "Connecting wallet…", send: "Confirm the YOUCOG transfer in your wallet…", confirm: "Waiting for Base to confirm…", verify: "Verifying your purchase…" };
export const DISCLAIMER = "Cosmetics are just for fun. YOUCOG has no promised value. Not investment advice. You pay a little Base gas.";

/** Ghost Shop: buy cosmetics with real YOUCOG (transfer to the faucet on Base), verified server-side. */
export function CosmeticsStore() {
  const [tab, setTab] = useState<StoreTab>("hats");
  const [owned, setOwned] = useState<string[]>(DEFAULT_OWNED);
  const [equipped, setEquipped] = useState<Outfit>(DEFAULT_OUTFIT);
  const [tryOn, setTryOn] = useState<StoreItem | null>(null);
  const [sheet, setSheet] = useState<StoreItem | null>(null);
  const [wallet, setWallet] = useState<Address | null>(null);
  const [bal, setBal] = useState<number | null>(null);
  const [step, setStep] = useState<BuyStep | null>(null);
  const [buyErr, setBuyErr] = useState<string | null>(null);
  const [pending, setPending] = useState<{ hash: Hex; from: Address; itemId: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [view, setView] = useState<"shop" | "quests">("shop");
  const [sig, setSig] = useState<Signals>(EMPTY_SIGNALS);
  const [sigSrc, setSigSrc] = useState<"loading" | "live" | "demo" | "none" | "error">("loading");
  const simDone: string[] = [];
  const [purchased, setPurchased] = useState<string[]>([]);
  const bought = purchased.filter((id) => !QUEST_REWARD_IDS.has(id)).length;
  useEffect(() => { loadSignals().then(([s, src]) => { setSig(s); setSigSrc(src); }); }, []);
  const loadWallet = async (w: Address) => {
    setWallet(w);
    youcogBalance(w).then(setBal).catch(() => setBal(null));
    ownedFromApi(w).then((o) => { setPurchased(o); setOwned((cur) => [...new Set([...cur, ...o])]); }).catch((e) => flash(friendlyError(e)));
  };
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("item");
    const it = id ? STORE_ITEMS.find((i) => i.id === id) : undefined;
    if (it) { setTryOn(it); const t = STORE_TABS.find((x) => itemsForTab(x.id).includes(it)); if (t) setTab(t.id); }
  }, []);
  useEffect(() => {
    // ?address= shows a wallet's saved items read-only (no wallet needed); a connected wallet takes over for buying.
    const a = new URLSearchParams(location.search).get("address");
    if (a && /^0x[0-9a-fA-F]{40}$/.test(a)) ownedFromApi(a as Address).then((o) => { setPurchased(o); setOwned((cur) => [...new Set([...cur, ...o])]); }).catch(() => {});
    peekWallet().then((w) => w && loadWallet(w)).catch(() => {});
  }, []);
  const doConnect = () => connect().then(({ from }) => loadWallet(from)).catch((e) => setBuyErr(friendlyError(e)));
  const applyOwned = (o: string[], it: StoreItem) => { setPurchased(o); setOwned((cur) => [...new Set([...cur, ...o])]); setPending(null); setSheet(null); setTryOn(it); flash(`Bought ${it.name}`); if (wallet) youcogBalance(wallet).then(setBal).catch(() => {}); };
  const local = { owned, bought, categoriesOwned: new Set(STORE_ITEMS.filter((i) => owned.includes(i.id)).map((i) => i.cat)).size };
  const flash = (s: string) => { setToast(s); setTimeout(() => setToast(null), 1600); };
  const shown: Outfit = tryOn ? { ...equipped, [tryOn.cat]: tryOn.id } : equipped;
  const sel = tryOn;
  const equip = (it: StoreItem) => { setEquipped((o) => ({ ...o, [it.cat]: o[it.cat] === it.id ? undefined : it.id })); setTryOn(null); flash(equipped[it.cat] === it.id ? `Took off ${it.name}` : `Equipped ${it.name}`); };
  const buy = async (it: StoreItem) => {
    if (it.questOnly) return flash("Earn this in Forge quests");
    if (purchased.includes(it.id)) return flash("Already owned");
    setBuyErr(null);
    try {
      const r = await buyCosmetic(it.id, it.price, setStep, (hash, from) => setPending({ hash, from, itemId: it.id }));
      if (r.ok) applyOwned(r.owned, it);
      else setBuyErr(r.pending ? `Payment sent, verification pending: ${r.error}` : r.error);
    } catch (e) { setBuyErr(friendlyError(e)); }
    finally { setStep(null); }
  };
  const retryVerify = async (it: StoreItem) => {
    if (!pending) return;
    setBuyErr(null); setStep("verify");
    const r = await verifyPurchaseApi(pending.from, pending.itemId, pending.hash);
    setStep(null);
    if (r.ok) applyOwned(r.owned, it); else setBuyErr(r.pending ? `Verification pending: ${r.error}` : r.error);
  };

  return (
    <div data-testid="cosmetics-store" style={{ color: "#fff", fontFamily: "ui-monospace,monospace", maxWidth: 390, margin: "0 auto", padding: "8px 14px 120px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <a href="/lab" style={{ color: "#9cc0ff", fontSize: 11, textDecoration: "none" }}>‹ Lab</a>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: ".1em" }}>GHOST SHOP</div>
        {wallet ? <div data-testid="balance" style={{ fontSize: 11, color: "#f5b301" }}>{bal === null ? "…" : fmt(bal)} YOUCOG</div>
          : <button data-testid="connect" onClick={doConnect} style={{ ...btn("#0052ff", "#fff"), fontSize: 10, padding: "5px 8px" }}>CONNECT</button>}
      </div>
      <div style={{ position: "relative", display: "flex", justifyContent: "center", margin: "8px 0", background: "#111a44", border: `1px solid ${sel ? RC[sel.rarity] : "#2a3570"}`, borderRadius: 14 }}>
        <GhostCanvas outfit={shown} px={6} />
        <div style={{ position: "absolute", left: 8, top: 6, fontSize: 9, color: sel ? RC[sel.rarity] : "#8892b0" }}>{sel ? `TRYING ON · ${sel.rarity.toUpperCase()}` : "EQUIPPED"}</div>
      </div>
      {sel && (
        <div data-testid="tryon-bar" style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
          <div style={{ flex: 1, fontSize: 11 }}><b>{sel.name}</b><div style={{ color: "#8892b0", fontSize: 9 }}>{sel.questOnly ? `🔒 Earn in Forge quests: ${sel.questOnly}` : owned.includes(sel.id) ? "Owned" : `${fmt(sel.price)} YOUCOG`}</div></div>
          {owned.includes(sel.id) ? <button data-testid="equip" onClick={() => equip(sel)} style={btn("#39ff14", "#0a0f2c")}>{equipped[sel.cat] === sel.id ? "UNEQUIP" : "EQUIP"}</button>
            : sel.questOnly ? <button data-testid="see-quest" onClick={() => { setView("quests"); setTryOn(null); }} style={{ fontSize: 9, color: "#f5b301", background: "none", border: "1px solid #f5b301", borderRadius: 8, padding: "6px 8px" }}>QUEST ONLY · {QUEST_FOR_ITEM[sel.id] ? `${progress(QUEST_FOR_ITEM[sel.id], sig, local, simDone).pct}%` : ""}</button>
            : <button data-testid="buy" onClick={() => { setBuyErr(null); setSheet(sel); }} style={btn("#0052ff", "#fff")}>BUY</button>}
          <button onClick={() => setTryOn(null)} style={btn("#2a3570", "#fff")}>✕</button>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
        {STORE_TABS.map((t) => (
          <button key={t.id} data-tab={t.id} onClick={() => { setTab(t.id); setView("shop"); }} style={{ padding: "7px 0", fontSize: 11, borderRadius: 8, border: "1px solid #2a3570", background: view === "shop" && tab === t.id ? "#f5b301" : "#111a44", color: view === "shop" && tab === t.id ? "#0a0f2c" : "#fff" }}>{t.icon} {t.label}</button>
        ))}
        <button data-tab="quests" onClick={() => { setView("quests"); setTryOn(null); }} style={{ gridColumn: "1 / -1", padding: "8px 0", fontSize: 11, fontWeight: 700, borderRadius: 8, border: "1px solid #39ff14", background: view === "quests" ? "#39ff14" : "#111a44", color: view === "quests" ? "#0a0f2c" : "#39ff14" }}>⚒ FORGE QUESTS · {QUESTS.filter((q) => q.saves && owned.includes(q.reward)).length} earned</button>
      </div>
      {view === "quests" && (
        <div data-testid="quests" style={{ marginTop: 10 }}>
          <div data-testid="signal-src" style={{ fontSize: 9, color: "#8892b0", marginBottom: 6 }}>{SRC[sigSrc]}</div>
          {QUESTS.map((q) => {
            const pr = progress(q, sig, local, simDone), got = !!q.saves && owned.includes(q.reward), earnable = !!q.saves;
            return (
              <div key={q.id} data-quest={q.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: 6, marginBottom: 6, borderRadius: 10, background: "#111a44", border: `1px solid ${got ? "#39ff14" : "#2a3570"}` }}>
                <GhostCanvas outfit={{ skin: "skin-classic", [STORE_ITEMS.find((i) => i.id === q.reward)!.cat]: q.reward }} px={1.5} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700 }}>{q.name}</div>
                  <div style={{ fontSize: 9, color: "#9cc0ff" }}>{q.rewardName}{STORE_ITEMS.find((i) => i.id === q.reward)?.questOnly ? " · quest-only" : ""} <span style={{ color: earnable && sigSrc === "live" ? "#39ff14" : "#f5b301" }}>[{!earnable ? "COMING LATER" : sigSrc === "live" ? "VERIFIED" : sigSrc === "demo" ? "DEMO DATA" : "NOT LOADED"}]</span></div>
                  <div style={{ height: 6, background: "#0a0f2c", borderRadius: 3, marginTop: 3, overflow: "hidden" }}><div style={{ width: `${pr.pct}%`, height: "100%", background: pr.done ? "#39ff14" : "#3a86ff", transition: "width .6s" }} /></div>
                  <div style={{ fontSize: 8, color: "#8892b0", marginTop: 2 }}>{pr.have.toLocaleString("en-US", { maximumFractionDigits: 1 })} / {pr.goal}{q.note ? ` · ${q.note}` : ""}</div>
                </div>
                {got ? <div data-unlocked={q.id} style={{ fontSize: 9, color: "#39ff14", textAlign: "center" }}>UNLOCKED<br />SAVED</div>
                  : earnable && pr.done ? <div style={{ fontSize: 8, color: "#39ff14", textAlign: "center" }}>EARNED<br />SYNCING</div>
                  : !earnable ? <div data-sim={q.id} style={{ fontSize: 8, color: "#f5b301", textAlign: "center" }}>NOT YET<br />EARNABLE</div>
                  : <div style={{ fontSize: 9, color: "#8892b0" }}>{pr.pct}%</div>}
              </div>
            );
          })}
          <div style={{ fontSize: 9, color: "#8892b0", textAlign: "center", lineHeight: 1.5 }}>VERIFIED quests are checked on our server from your real faucet claims and verified shop purchases, and unlocks are saved to your wallet on every device. COMING LATER quests can't be earned yet. Quest rewards are quest-only and can't be bought. Cosmetics are just for fun and have no promised value.</div>
        </div>
      )}
      {view === "shop" && <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 10 }}>
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
      </div>}
      <div style={{ fontSize: 9, color: "#8892b0", marginTop: 10, textAlign: "center", lineHeight: 1.5 }}>
        {DISCLAIMER} Purchases are saved to your wallet address. Shop-only seasonal items aren't mintable traits yet.
      </div>
      {sheet && (
        <div onClick={() => !step && setSheet(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end" }}>
          <div data-testid="buy-sheet" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 390, margin: "0 auto", background: "#111a44", borderTop: `3px solid ${RC[sheet.rarity]}`, borderRadius: "16px 16px 0 0", padding: 16 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <GhostCanvas outfit={{ ...equipped, [sheet.cat]: sheet.id }} px={3} />
              <div><div style={{ fontWeight: 700 }}>{sheet.name}</div><div style={{ color: RC[sheet.rarity], fontSize: 11 }}>{sheet.rarity}</div>
                <div style={{ fontSize: 18, marginTop: 4 }}>{fmt(sheet.price)} YOUCOG</div></div>
            </div>
            <div style={{ fontSize: 11, color: "#c9d1e6", marginTop: 10, lineHeight: 1.5 }}>The YOUCOG you spend goes back to the faucet, so other people can claim it.</div>
            {wallet && bal !== null && <div style={{ fontSize: 11, color: "#f5b301", marginTop: 6 }}>Your balance: {fmt(bal)} YOUCOG{bal >= sheet.price ? ` · after: ${fmt(bal - sheet.price)}` : ""}</div>}
            {!wallet && <div style={{ fontSize: 11, color: "#f5b301", marginTop: 6 }}>Connect your wallet to buy.</div>}
            <div data-testid="disclaimer" style={{ fontSize: 9, color: "#8892b0", marginTop: 8, lineHeight: 1.5 }}>{DISCLAIMER}</div>
            {step && <div data-testid="buy-step" style={{ fontSize: 11, color: "#39ff14", marginTop: 8 }}>{BUY_STEP[step]}</div>}
            {buyErr && <div role="alert" data-testid="buy-error" style={{ fontSize: 11, color: "#ff8080", marginTop: 8, wordBreak: "break-word" }}>{buyErr}</div>}
            {pending && pending.itemId === sheet.id && !step && <a href={`https://basescan.org/tx/${pending.hash}`} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 10, color: "#9cc0ff", marginTop: 6 }}>View transfer on Basescan</a>}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setSheet(null)} disabled={!!step} style={{ ...btn("#2a3570", "#fff"), flex: 1, padding: 12 }}>CANCEL</button>
              {pending && pending.itemId === sheet.id
                ? <button data-testid="retry-verify" onClick={() => retryVerify(sheet)} disabled={!!step} style={{ ...btn("#f5b301", "#0a0f2c"), flex: 2, padding: 12 }}>RETRY VERIFY</button>
                : !wallet ? <button onClick={doConnect} style={{ ...btn("#0052ff", "#fff"), flex: 2, padding: 12 }}>CONNECT WALLET</button>
                : <button data-testid="confirm-buy" onClick={() => buy(sheet)} disabled={!!step || (bal !== null && bal < sheet.price)} style={{ ...btn("#0052ff", "#fff"), flex: 2, padding: 12 }}>{bal !== null && bal < sheet.price ? "NOT ENOUGH YOUCOG" : step ? "WORKING…" : `PAY ${fmt(sheet.price)} YOUCOG`}</button>}
            </div>
          </div>
        </div>
      )}
      {toast && <div style={{ position: "fixed", left: 20, right: 20, bottom: 30, background: "#1b1b2f", border: "1px solid #f5b301", borderRadius: 10, padding: 10, fontSize: 11, textAlign: "center" }}>{toast}</div>}
    </div>
  );
}
const SRC = { loading: "Reading your progress…", live: "Live progress for your wallet (read-only).", demo: "DEMO SIGNALS (dev preview): sample claim history, not a real wallet.", none: "Connect in the Mini App (or add ?address=0x…) to read real progress.", error: "Couldn't read progress right now; showing 0." } as const;
async function loadSignals(): Promise<[Signals, keyof typeof SRC]> {
  const q = new URLSearchParams(location.search);
  if (import.meta.env.DEV && q.has("demo")) return [{ streak: 11, longestStreak: 11, totalClaims: 8, ycurv: 0 }, "demo"];
  try {
    const { sdk } = await import("@farcaster/miniapp-sdk");
    const addr = q.get("address");
    let r: Response | null = null;
    if (addr && /^0x[0-9a-fA-F]{40}$/.test(addr)) r = await fetch(`/api/quests?address=${addr}`);
    else if (await sdk.isInMiniApp()) r = await sdk.quickAuth.fetch(`${location.origin}/api/quests`);
    if (!r) return [EMPTY_SIGNALS, "none"];
    const j = await r.json();
    return j.ok ? [{ streak: j.streak, longestStreak: j.longestStreak, totalClaims: j.totalClaims, ycurv: j.ycurv }, "live"] : [EMPTY_SIGNALS, "error"];
  } catch { return [EMPTY_SIGNALS, "error"]; }
}
const btn = (bg: string, fg: string) => ({ background: bg, color: fg, border: 0, borderRadius: 8, padding: "8px 12px", fontSize: 11, fontWeight: 700, fontFamily: "inherit" }) as const;
export const STORE_COUNT = STORE_ITEMS.length;
