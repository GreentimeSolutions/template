import { useEffect, useMemo, useState } from "react";
import { STORE_ITEMS } from "@/lib/youcog/cosmetics-store";
import { CATEGORIES, CONTEST_COSMETICS, COSMETICS, DEFAULT_OUTFIT, DEFAULT_OWNED, LAB_GHOST_BG, LAB_SAVE_PX, RARITY_PRICE, drawGhost, type Category, type Cosmetic, type Outfit } from "@/lib/youcog/ghost-wardrobe";
import { hasContestItems, labGhostPath, labStatus, outfitToTraits, publicLeft, stripContestItems, toggleOutfitItem, type LabStatus } from "@/lib/youcog/ghost-lab-core";
import { ownedFromApi, peekWallet, connectedOwner, ownerMintTo, ownerUnpause, demoMode, friendlyError, ghostLabEnabled, ghostsContract, mintGhost, previewSvg, readLab, type MintStep } from "@/lib/youcog/ghost-lab";
import { setLabGhostPfp } from "@/lib/youcog/ghost-pfp";
import { canvasToPngFile, saveGhostFile } from "@/lib/youcog/save-ghost-image";
import { useMiniApp } from "@/lib/youcog/use-miniapp";
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

/** Ghost Lab: dress your ghost and save a picture. Minting stays optional and flag-gated. */
/** Quest-only labels (every quest reward is quest-only and never sold). */
const MINTABLE = new Set(COSMETICS.map((c) => c.id));
const QO: Record<string, string> = Object.fromEntries(STORE_ITEMS.filter((i) => i.questOnly).map((i) => [i.id, i.questOnly!]));

function renderSaveCanvas(outfit: Outfit): HTMLCanvasElement {
  const px = LAB_SAVE_PX;
  const canvas = document.createElement("canvas");
  canvas.width = 32 * px;
  canvas.height = 32 * px;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");
  drawGhost(ctx, outfit, 0, px, LAB_GHOST_BG);
  return canvas;
}

export function GhostLab() {
  const addr = ghostsContract();
  const demo = demoMode();
  const minting = ghostLabEnabled();
  const miniApp = useMiniApp();
  const [cat, setCat] = useState<Category>("hat");
  const [outfit, setOutfit] = useState<Outfit>(DEFAULT_OUTFIT);
  // Cosmetic ownership = starter items + Ghost Shop purchases + server-verified quest unlocks (from /api/shop). ?address= reads a wallet read-only.
  // The mint below does NOT depend on them (the contract doesn't check).
  const [owned, setOwned] = useState<string[]>(DEFAULT_OWNED);
  useEffect(() => { if (demo || !minting) return; const qa = new URLSearchParams(location.search).get("address"); (qa && /^0x[0-9a-fA-F]{40}$/.test(qa) ? Promise.resolve(qa as `0x${string}`) : peekWallet()).then((w) => w && ownedFromApi(w)).then((o) => o && setOwned((cur) => [...new Set([...cur, ...o])])).catch(() => {}); }, [demo, minting]);
  const [chain, setChain] = useState<null | { status: LabStatus; price: bigint; left: number; paused?: boolean; minted?: number }>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [step, setStep] = useState<MintStep | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [ownerMsg, setOwnerMsg] = useState<string | null>(null);
  const [savePreview, setSavePreview] = useState<{ url: string; message: string } | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [homeMsg, setHomeMsg] = useState<string | null>(null);
  const refresh = () => addr && readLab(addr).then((c) => setChain({ status: labStatus(c), price: c.price, left: publicLeft(c), paused: c.paused, minted: c.totalSupply })).catch(() => {});
  const ownerAct = async (f: () => Promise<string>, label: string) => {
    setOwnerMsg(`${label}: confirm in wallet…`);
    try { const h = await f(); setOwnerMsg(`${label} done: https://basescan.org/tx/${h}`); refresh(); }
    catch (e) { setOwnerMsg(friendlyError(e)); }
  };
  useEffect(() => {
    if (!minting) return;
    if (demo) { setChain({ status: "open", price: 0n, left: 989 }); return; }
    if (!addr) return;
    readLab(addr).then((c) => setChain({ status: labStatus(c), price: c.price, left: publicLeft(c), paused: c.paused, minted: c.totalSupply })).catch(() => setChain(null));
  }, [addr, demo, minting]);
  useEffect(() => {
    if (!minting || !addr || demo || hasContestItems(outfit)) { setSvg(null); return; }
    let live = true;
    let traits: number[];
    try { traits = outfitToTraits(outfit); } catch { setSvg(null); return; }
    const t = setTimeout(() => previewSvg(addr, traits).then((s) => live && setSvg(s)).catch(() => live && setSvg(null)), 250);
    return () => { live = false; clearTimeout(t); };
  }, [addr, demo, minting, outfit]);
  useEffect(() => () => { if (savePreview) URL.revokeObjectURL(savePreview.url); }, [savePreview]);

  const traits = useMemo(() => {
    try { return hasContestItems(outfit) ? null : outfitToTraits(outfit); }
    catch { return null; }
  }, [outfit]);
  const contestOn = hasContestItems(outfit);
  const onChain = COSMETICS.filter((x) => x.cat === cat && (MINTABLE.has(x.id) || owned.includes(x.id) || !QO[x.id]));
  const contest = CONTEST_COSMETICS.filter((x) => x.cat === cat);

  const tap = (id: string) => {
    setOutfit((cur) => toggleOutfitItem(cur, id));
    setHomeMsg(null);
  };

  const useAsMyGhost = () => {
    setLabGhostPfp(outfit);
    setHomeMsg("This is now your ghost on the home card.");
  };

  const saveImage = async () => {
    setErr(null);
    setSaveBusy(true);
    let previewUrl: string | null = null;
    try {
      const canvas = renderSaveCanvas(outfit);
      const file = await canvasToPngFile(canvas);
      previewUrl = URL.createObjectURL(file);
      setLabGhostPfp(outfit);
      const hostedUrl = new URL(labGhostPath(outfit), location.origin).href;
      const result = await saveGhostFile({ file, hostedUrl, inMiniApp: miniApp.inMiniApp });
      const extra = " This is now your ghost on the home card.";
      if (savePreview) URL.revokeObjectURL(savePreview.url);
      setSavePreview({ url: previewUrl, message: `${result.message}${extra}` });
    } catch (e) {
      console.error("[ghost-lab] save failed", e);
      const message = "Couldn't save automatically. Press and hold the image to save it.";
      if (previewUrl) {
        if (savePreview) URL.revokeObjectURL(savePreview.url);
        setSavePreview({ url: previewUrl, message });
        setLabGhostPfp(outfit);
      } else {
        setErr(e instanceof Error ? e.message : "Couldn't render that ghost.");
      }
    } finally {
      setSaveBusy(false);
    }
  };

  const doMint = async () => {
    setErr(null);
    if (contestOn) return;
    if (demo) {
      for (const s of ["connect", "mint", "confirm"] as MintStep[]) { setStep(s); await new Promise((r) => setTimeout(r, reduced() ? 300 : 1300)); }
      setStep(null); setDone({ id: 2, hash: "0xdemo", name: "Youcognito Ghost #2", image: "" }); return;
    }
    if (!minting || !addr || !traits) return;
    try { setDone(await mintGhost(addr, traits, setStep)); }
    catch (e) { setErr(friendlyError(e)); }
    finally { setStep(null); readLab(addr).then((c) => setChain({ status: labStatus(c), price: c.price, left: publicLeft(c), paused: c.paused, minted: c.totalSupply })).catch(() => {}); }
  };

  const canMint = minting && (demo || !!addr) && chain?.status === "open" && !step && !contestOn && !!traits;
  const priceLabel = chain ? (chain.price === 0n ? "Free (gas only)" : `${(Number(chain.price / 10n ** 14n) / 1e4).toLocaleString()} YOUCOG`) : "";

  const itemTile = (c: Cosmetic, contestItem: boolean) => {
    const on = outfit[c.cat] === c.id, have = owned.includes(c.id);
    return (
      <button key={c.id} data-item={c.id} data-contest={contestItem || undefined} onClick={() => tap(c.id)} style={{ padding: 4, borderRadius: 10, border: `2px solid ${on ? "#f5b301" : "#2a3570"}`, background: "#111a44", color: "#fff", fontSize: 9, position: "relative" }}>
        <GhostCanvas outfit={{ skin: c.cat === "bg" ? "skin-classic" : (c.cat === "skin" ? c.id : "skin-classic"), [c.cat]: c.id }} px={2} />
        <div>{c.name}</div>
        {contestItem ? (
          <div data-testid="contest-badge" style={{ color: "#f5b301", fontSize: 8, letterSpacing: ".02em", lineHeight: 1.25, marginTop: 2 }}>Contest only, not mintable</div>
        ) : (
          <div style={{ color: RC[c.rarity] }}>{on ? "WEARING" : have ? "OWNED" : QO[c.id] ? "QUEST" : `${RARITY_PRICE[c.rarity]} · ${c.rarity}`}</div>
        )}
      </button>
    );
  };

  return (
    <div data-testid="ghost-lab" style={{ color: "#fff", fontFamily: "ui-monospace,monospace", maxWidth: 390, margin: "0 auto", padding: "8px 14px 24px" }}>
      {demo && <div style={{ textAlign: "center", fontSize: 10, letterSpacing: ".2em", color: "#f5b301" }}>DEMO · SIMULATED WALLET</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <a href="/" style={{ color: "#9cc0ff", fontSize: 11, textDecoration: "none" }}>‹ Home</a>
        {chain && minting ? <div style={{ fontSize: 11, color: "#9cc0ff" }}>{chain.left.toLocaleString()} left</div> : <span />}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: ".1em", marginTop: 8 }}>GHOST LAB</div>
      <div style={{ display: "flex", justifyContent: "center", margin: "10px 0", background: "#111a44", border: "1px solid #2a3570", borderRadius: 14, minHeight: 256 }}>
        {svg && !contestOn ? <img alt="Your ghost, rendered by the contract" src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} width={256} height={256} style={{ imageRendering: "pixelated" }} /> : <GhostCanvas outfit={outfit} px={8} />}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {CATEGORIES.map((k) => (
          <button key={k.id} data-cat={k.id} onClick={() => setCat(k.id)} style={{ flex: "1 0 22%", padding: "8px 0", fontSize: 11, borderRadius: 8, border: "1px solid #2a3570", background: cat === k.id ? "#f5b301" : "#111a44", color: cat === k.id ? "#0a0f2c" : "#fff" }}>{k.label}</button>
        ))}
      </div>
      {onChain.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 10 }}>
          {onChain.map((c) => itemTile(c, false))}
        </div>
      )}
      {contest.length > 0 && (
        <div data-testid="contest-only" style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: ".12em", color: "#f5b301", textTransform: "uppercase", marginBottom: 8 }}>Contest only — not mintable</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {contest.map((c) => itemTile(c, true))}
          </div>
        </div>
      )}
      <div style={{ fontSize: 10, color: "#8892b0", marginTop: 8, textAlign: "center" }}>Tap any item to try it on. Save a picture of your ghost to make it your creation on the home card — no wallet needed.</div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button data-testid="save-ghost" type="button" onClick={() => void saveImage()} disabled={saveBusy} style={{ flex: 1, padding: 14, borderRadius: 12, border: 0, background: "#f5b301", color: "#0a0f2c", fontWeight: 700, letterSpacing: ".12em" }}>
          {saveBusy ? "SAVING…" : "SAVE IMAGE"}
        </button>
        <button data-testid="use-as-my-ghost" type="button" onClick={useAsMyGhost} style={{ flex: 1, padding: 14, borderRadius: 12, border: "1px solid #f5b301", background: "#111a44", color: "#f5b301", fontWeight: 700, letterSpacing: ".06em", fontSize: 12 }}>
          USE AS MY GHOST
        </button>
      </div>
      {homeMsg && <div data-testid="home-ghost-status" role="status" style={{ marginTop: 8, color: "#9cc0ff", fontSize: 12, textAlign: "center" }}>{homeMsg}</div>}
      {minting ? (
        <>
          <a data-testid="open-shop" href="/lab/shop" style={{ display: "block", marginTop: 10, padding: 10, borderRadius: 12, border: "1px solid #3a86ff", color: "#9cc0ff", fontSize: 11, textAlign: "center", textDecoration: "none" }}>OPEN GHOST SHOP</a>
          {!addr && !demo && <div style={{ marginTop: 10, textAlign: "center", fontSize: 12 }}>Minting opens soon.</div>}
          {chain && chain.minted !== undefined && <div data-testid="chain-state" style={{ marginTop: 10, textAlign: "center", fontSize: 10, color: "#8892b0" }}>ON-CHAIN: {chain.paused ? "PAUSED" : "LIVE"} · {chain.minted}/1000 MINTED</div>}
          {chain && chain.status !== "open" && <div data-testid="status" style={{ marginTop: 10, textAlign: "center", fontSize: 12 }}>{STATUS[chain.status]}</div>}
          {contestOn && (
            <div data-testid="contest-mint-note" style={{ marginTop: 10, textAlign: "center", fontSize: 12, color: "#f5b301" }}>
              Remove contest-only items to mint.{" "}
              <button type="button" data-testid="strip-contest" onClick={() => setOutfit((o) => stripContestItems(o))} style={{ background: "none", border: 0, color: "#9cc0ff", textDecoration: "underline", font: "inherit", cursor: "pointer" }}>
                Strip them
              </button>
            </div>
          )}
          <button data-testid="mint" onClick={doMint} disabled={!canMint} style={{ width: "100%", marginTop: 10, padding: 14, borderRadius: 12, border: 0, background: canMint ? "#0052ff" : "#2a3570", color: "#fff", fontWeight: 700, letterSpacing: ".15em" }}>
            MINT 1/1000{chain?.status === "open" && !contestOn ? ` · ${priceLabel}` : ""}
          </button>
        </>
      ) : null}
      {minting && addr && !demo && !owner && <button data-testid="owner-check" onClick={() => { setOwnerMsg("Checking wallet…"); connectedOwner(addr).then((o) => { setOwner(o ?? ""); setOwnerMsg(null); }).catch((e) => setOwnerMsg(friendlyError(e))); }} style={{ marginTop: 10, width: "100%", background: "none", border: 0, color: "#4a5590", fontSize: 10 }}>Owner tools</button>}
      {minting && addr && owner && owner !== "" && (
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
          <button type="button" onClick={() => ownerAct(() => ownerMintTo(addr, traits ?? outfitToTraits(stripContestItems(outfit))), "Owner mint")} style={{ fontSize: 10, color: "#8892b0", background: "none", border: "1px solid #2a3570", borderRadius: 8, padding: "6px 8px" }}>Owner mint</button>
          <button type="button" onClick={() => ownerAct(() => ownerUnpause(addr), chain?.paused ? "Unpause" : "Pause")} style={{ fontSize: 10, color: "#8892b0", background: "none", border: "1px solid #2a3570", borderRadius: 8, padding: "6px 8px" }}>{chain?.paused ? "Unpause" : "Pause"}</button>
          {ownerMsg && <div style={{ width: "100%", fontSize: 10, color: "#8892b0", textAlign: "center" }}>{ownerMsg}</div>}
        </div>
      )}
      {minting && addr && owner === "" && <div style={{ marginTop: 6, fontSize: 10, color: "#4a5590", textAlign: "center" }}>Not the owner wallet.</div>}
      {err && <div role="alert" style={{ marginTop: 8, color: "#ff8080", fontSize: 12, textAlign: "center" }}>{err}</div>}
      {savePreview && (
        <div data-testid="save-ghost-preview" onClick={() => { URL.revokeObjectURL(savePreview.url); setSavePreview(null); }} style={{ position: "fixed", inset: 0, background: "rgba(10,15,44,.96)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 40 }}>
          <img alt="Your ghost" src={savePreview.url} width={280} height={280} style={{ imageRendering: "pixelated", width: "min(80vw, 320px)", height: "auto", borderRadius: 12, background: LAB_GHOST_BG }} />
          <div data-testid="save-ghost-status" role="status" style={{ marginTop: 14, fontSize: 14, color: "#f5b301", textAlign: "center", maxWidth: 320, lineHeight: 1.4 }}>{savePreview.message}</div>
          <div style={{ marginTop: 8, fontSize: 13, color: "#9cc0ff", textAlign: "center" }}>Press and hold the image to save it</div>
          <div style={{ marginTop: 18, fontSize: 10, color: "#8892b0" }}>Tap to close</div>
        </div>
      )}
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
