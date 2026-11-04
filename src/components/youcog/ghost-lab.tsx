import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, COSMETICS, DEFAULT_OUTFIT, DEFAULT_OWNED, RARITY_PRICE, QUEST_ONLY, QUESTS, type Category, type Outfit } from "@/lib/youcog/ghost-wardrobe";
import { labStatus, outfitToTraits, publicLeft, type LabStatus } from "@/lib/youcog/ghost-lab-core";
import { connectedOwner, ownerMintTo, ownerUnpause, demoMode, friendlyError, ghostsContract, mintGhost, previewSvg, readLab, type MintStep } from "@/lib/youcog/ghost-lab";
import { GhostCanvas } from "./ghost-wardrobe";

const RC: Record<string, string> = { common: "#8892b0", rare: "#3a86ff", epic: "#b15cff", legendary: "#f5b301" };
const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const STEP: Record<MintStep, string> = { connect: "CONNECTING WALLET…", approve: "APPROVE YOUCOG IN WALLET…", mint: "CONFIRM MINT IN WALLET…", confirm: "FORGING ON BASE…" };
const STATUS: Record<LabStatus, string> = {
  paused: "Minting opens soon.", "not-started": "Minting opens soon.", "sold-out": "All public ghosts are minted.",
  "already-minted": "You've minted your ghost. One per wallet.", open: "",
};
const CODE = ["ghost.dress(outfit)", "traits -> uint8[6]", "mint() on Base", "tokenURI -> on-chain SVG"];
type Done = { id: number; hash: string; name: string; image: string };

/** Ghost Lab: dress your ghost, then mint 1 of 1,000. */
export function GhostLab() {
  const addr = ghostsContract();
  const demo = demoMode();
  const [cat, setCat] = useState<Category>("hat");
  const [outfit, setOutfit] = useState<Outfit>(DEFAULT_OUTFIT);
  // SIMULATED / LOCAL ONLY: cosmetic ownership, YOUCOG shop purchases and quest unlocks are not wired
  // to payments or on-chain state yet. The mint below does NOT depend on them (the contract doesn't check).
  const [owned, setOwned] = useState<string[]>(DEFAULT_OWNED);
  const [toast, setToast] = useState<string | null>(null);
  const [chain, setChain] = useState<null | { status: LabStatus; price: bigint; left: number; paused?: boolean; minted?: number }>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [step, setStep] = useState<MintStep | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [ownerMsg, setOwnerMsg] = useState<string | null>(null);
  const refresh = () => addr && readLab(addr).then((c) => setChain({ status: labStatus(c), price: c.price, left: publicLeft(c), paused: c.paused, minted: c.totalSupply })).catch(() => {});
  const ownerAct = async (f: () => Promise<string>, label: string) => {
    setOwnerMsg(`${label}: confirm in wallet…`);
    try { const h = await f(); setOwnerMsg(`${label} done: https://basescan.org/tx/${h}`); refresh(); }
    catch (e) { setOwnerMsg(friendlyError(e)); }
  };
  const traits = useMemo(() => outfitToTraits(outfit), [outfit]);
  const flash = (s: string) => { setToast(s); setTimeout(() => setToast(null), 1500); };

  useEffect(() => {
    if (demo) { setChain({ status: "open", price: 0n, left: 989 }); return; }
    if (!addr) return;
    readLab(addr).then((c) => setChain({ status: labStatus(c), price: c.price, left: publicLeft(c), paused: c.paused, minted: c.totalSupply })).catch(() => setChain(null));
  }, [addr, demo]);
  useEffect(() => {
    if (!addr || demo) return;
    let live = true;
    const t = setTimeout(() => previewSvg(addr, traits).then((s) => live && setSvg(s)).catch(() => live && setSvg(null)), 250);
    return () => { live = false; clearTimeout(t); };
  }, [addr, demo, traits]);

  const tap = (id: string) => {
    const c = COSMETICS.find((x) => x.id === id)!;
    if (outfit[c.cat] === id) return setOutfit({ ...outfit, [c.cat]: undefined });
    if (!owned.includes(id) && QUEST_ONLY[id]) return flash(`Earn it: ${QUEST_ONLY[id]}`);
    if (!owned.includes(id)) { setOwned([...owned, id]); flash(`Unlocked ${c.name} (shop coming soon, free in preview)`); }
    setOutfit({ ...outfit, [c.cat]: id });
  };
  const quest = () => { const q = QUESTS[0]; const c = COSMETICS.find((x) => x.id === q.reward)!; setOwned((o) => [...o, c.id]); setOutfit((o) => ({ ...o, [c.cat]: c.id })); setCat(c.cat); flash(`Quest preview: unlocked ${c.name}`); };

  const doMint = async () => {
    setErr(null);
    if (demo) {
      for (const s of ["connect", "mint", "confirm"] as MintStep[]) { setStep(s); await new Promise((r) => setTimeout(r, reduced() ? 300 : 1300)); }
      setStep(null); setDone({ id: 2, hash: "0xdemo", name: "Youcognito Ghost #2", image: "" }); return;
    }
    if (!addr) return;
    try { setDone(await mintGhost(addr, traits, setStep)); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setStep(null); readLab(addr).then((c) => setChain({ status: labStatus(c), price: c.price, left: publicLeft(c), paused: c.paused, minted: c.totalSupply })).catch(() => {}); }
  };

  const canMint = (demo || !!addr) && chain?.status === "open" && !step;
  const priceLabel = chain ? (chain.price === 0n ? "Free (gas only)" : `${(Number(chain.price / 10n ** 14n) / 1e4).toLocaleString()} YOUCOG`) : "";

  return (
    <div data-testid="ghost-lab" style={{ color: "#fff", fontFamily: "ui-monospace,monospace", maxWidth: 390, margin: "0 auto", padding: "8px 14px 24px" }}>
      {demo && <div style={{ textAlign: "center", fontSize: 10, letterSpacing: ".2em", color: "#f5b301" }}>DEMO · SIMULATED WALLET</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: ".1em" }}>GHOST LAB</div>
        {chain && <div style={{ fontSize: 11, color: "#9cc0ff" }}>{chain.left.toLocaleString()} left</div>}
      </div>
      <div style={{ display: "flex", justifyContent: "center", margin: "10px 0", background: "#111a44", border: "1px solid #2a3570", borderRadius: 14, minHeight: 256 }}>
        {svg ? <img alt="Your ghost, rendered by the contract" src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} width={256} height={256} style={{ imageRendering: "pixelated" }} /> : <GhostCanvas outfit={outfit} px={8} />}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {CATEGORIES.map((k) => (
          <button key={k.id} data-cat={k.id} onClick={() => setCat(k.id)} style={{ flex: "1 0 28%", padding: "8px 0", fontSize: 11, borderRadius: 8, border: "1px solid #2a3570", background: cat === k.id ? "#f5b301" : "#111a44", color: cat === k.id ? "#0a0f2c" : "#fff" }}>{k.label}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 10 }}>
        {COSMETICS.filter((x) => x.cat === cat).map((c) => {
          const on = outfit[c.cat] === c.id, have = owned.includes(c.id);
          return (
            <button key={c.id} data-item={c.id} onClick={() => tap(c.id)} style={{ padding: 4, borderRadius: 10, border: `2px solid ${on ? "#f5b301" : "#2a3570"}`, background: "#111a44", color: "#fff", fontSize: 9 }}>
              <GhostCanvas outfit={{ skin: "skin-classic", [c.cat]: c.id }} px={2} />
              <div>{c.name}</div>
              <div style={{ color: RC[c.rarity] }}>{on ? "WEARING" : have ? "OWNED" : QUEST_ONLY[c.id] ? "QUEST" : `${RARITY_PRICE[c.rarity]} · ${c.rarity}`}</div>
            </button>
          );
        })}
      </div>
      <button data-testid="quest" onClick={quest} disabled={owned.includes(QUESTS[0].reward)} style={{ width: "100%", marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid #f5b301", background: "#111a44", color: "#f5b301", fontSize: 11 }}>FORGE QUEST: {QUESTS[0].name.toUpperCase()} (PREVIEW)</button>
      <a data-testid="open-shop" href="/lab/shop" style={{ display: "block", marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid #3a86ff", color: "#9cc0ff", fontSize: 11, textAlign: "center", textDecoration: "none" }}>OPEN GHOST SHOP (PREVIEW)</a>
      <div style={{ fontSize: 10, color: "#8892b0", marginTop: 8, textAlign: "center" }}>Shop and quests are a preview. Any outfit can be minted.</div>
      {!addr && !demo && <div style={{ marginTop: 10, textAlign: "center", fontSize: 12 }}>Minting opens soon.</div>}
      {chain && chain.minted !== undefined && <div data-testid="chain-state" style={{ marginTop: 10, textAlign: "center", fontSize: 10, color: "#8892b0" }}>ON-CHAIN: {chain.paused ? "PAUSED" : "LIVE"} · {chain.minted}/1000 MINTED</div>}
      {chain && chain.status !== "open" && <div data-testid="status" style={{ marginTop: 10, textAlign: "center", fontSize: 12 }}>{STATUS[chain.status]}</div>}
      <button data-testid="mint" onClick={doMint} disabled={!canMint} style={{ width: "100%", marginTop: 10, padding: 14, borderRadius: 12, border: 0, background: canMint ? "#0052ff" : "#2a3570", color: "#fff", fontWeight: 700, letterSpacing: ".15em" }}>
        MINT 1/1000{chain?.status === "open" ? ` · ${priceLabel}` : ""}
      </button>
      {addr && !demo && !owner && <button data-testid="owner-check" onClick={() => connectedOwner(addr).then((o) => setOwner(o ?? "")).catch(() => {})} style={{ marginTop: 10, width: "100%", background: "none", border: 0, color: "#4a5590", fontSize: 10 }}>Owner tools</button>}
      {addr && owner && (
        <div data-testid="owner-panel" style={{ marginTop: 12, padding: 10, border: "1px dashed #f5b301", borderRadius: 10, fontSize: 11 }}>
          <div style={{ color: "#f5b301", marginBottom: 6 }}>OWNER PANEL</div>
          <button onClick={() => ownerAct(() => ownerMintTo(addr, traits), "Owner mint")} style={{ width: "100%", padding: 8, marginBottom: 6 }}>Owner mint this outfit to my wallet (reserve)</button>
          <button onClick={() => ownerAct(() => ownerUnpause(addr), "Unpause")} disabled={chain?.status !== "paused"} style={{ width: "100%", padding: 8 }}>Unpause public mint</button>
          {ownerMsg && <div style={{ marginTop: 6, wordBreak: "break-all" }}>{ownerMsg}</div>}
        </div>
      )}
      {addr && owner === "" && <div style={{ marginTop: 6, fontSize: 10, color: "#4a5590", textAlign: "center" }}>Not the owner wallet.</div>}
      {err && <div role="alert" style={{ marginTop: 8, color: "#ff8080", fontSize: 12, textAlign: "center" }}>{err}</div>}
      {toast && <div style={{ position: "fixed", left: 20, right: 20, bottom: 30, background: "#1b1b2f", border: "1px solid #f5b301", borderRadius: 10, padding: 10, fontSize: 11, textAlign: "center" }}>{toast}</div>}
      {(step || done) && (
        <div onClick={() => done && setDone(null)} style={{ position: "fixed", inset: 0, background: "rgba(10,15,44,.96)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
          {done?.image ? <img alt={done.name} src={done.image} width={240} height={240} style={{ imageRendering: "pixelated" }} /> : <GhostCanvas outfit={outfit} px={7} />}
          {step && !reduced() && (
            <div style={{ marginTop: 12, fontSize: 11, color: "#39ff14", textShadow: "0 0 6px #ff2a2a", minHeight: 64 }}>
              {CODE.slice(0, ["connect", "approve", "mint", "confirm"].indexOf(step) + 1).map((l) => <div key={l}>&gt; {l}</div>)}
            </div>
          )}
          <div style={{ marginTop: 12, fontSize: 12, letterSpacing: ".25em", color: "#f5b301" }}>{step ? STEP[step] : "MINTED"}</div>
          {done && <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: ".1em", marginTop: 6 }}>GHOST #{done.id} / 1000</div>}
          {done && done.hash !== "0xdemo" && <a href={`https://basescan.org/tx/${done.hash}`} target="_blank" rel="noreferrer" style={{ marginTop: 14, color: "#9cc0ff", fontSize: 12 }}>View on Basescan</a>}
          {done && done.hash === "0xdemo" && <div style={{ marginTop: 14, fontSize: 10, color: "#8892b0" }}>Demo only. No transaction was sent.</div>}
          {done && <div style={{ marginTop: 18, fontSize: 10, color: "#8892b0" }}>Tap to close</div>}
        </div>
      )}
    </div>
  );
}
