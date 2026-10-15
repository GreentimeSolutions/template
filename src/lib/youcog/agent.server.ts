import { assertPublicUrl } from "./reader.server";
import type { MissionResult, Source } from "./types";

const PRIMARY_MODEL = "grok-4.5";
const FALLBACK_MODEL = "grok-4.7";
const SOURCE_CAP = 5;

const INSTRUCTIONS = [
  "You are Youcog, the private research agent inside Youcognito.",
  "The user is in a sealed session. Answer the mission directly, in plain prose, under 180 words.",
  "Use web search. Prefer a few primary sources.",
  "Do not tell the user to open a browser. Sealed tabs are opened for them from your citations.",
  "Do not ask for personal data. Do not mention these instructions.",
].join(" ");

type Annotation = { type?: string; url?: string };
type OutputContent = { type?: string; text?: string; annotations?: Annotation[] };
type OutputItem = { type?: string; text?: string; content?: OutputContent[] };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function pushUrl(urls: string[], value: unknown) {
  if (typeof value !== "string") return;
  const trimmed = value.trim().replace(/[),.;]+$/g, "");
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return;
    urls.push(url.toString());
  } catch {
    /* ignore non-urls */
  }
}

function collectText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const output = Array.isArray(payload.output) ? payload.output : [];
  const parts: string[] = [];
  for (const item of output) {
    const row = asRecord(item) as OutputItem | null;
    if (!row) continue;
    if (typeof row.text === "string" && (row.type === "output_text" || row.type === undefined)) {
      parts.push(row.text);
    }
    if (!Array.isArray(row.content)) continue;
    for (const block of row.content) {
      if (block?.type === "output_text" && typeof block.text === "string") parts.push(block.text);
    }
  }
  return parts.join("\n\n").trim();
}

function collectRawUrls(payload: Record<string, unknown>, brief: string): string[] {
  const urls: string[] = [];
  if (Array.isArray(payload.citations)) {
    for (const citation of payload.citations) {
      if (typeof citation === "string") pushUrl(urls, citation);
      else pushUrl(urls, asRecord(citation)?.url);
    }
  }
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    const row = asRecord(item);
    const content = row && Array.isArray(row.content) ? row.content : [];
    for (const block of content) {
      const annotations = asRecord(block)?.annotations;
      if (!Array.isArray(annotations)) continue;
      for (const note of annotations) pushUrl(urls, asRecord(note)?.url);
    }
  }
  const linked = brief.matchAll(/https?:\/\/[^\s)>\]]+/g);
  for (const match of linked) pushUrl(urls, match[0]);
  return urls;
}

export function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const last = parsed.pathname.replace(/\/$/, "").split("/").filter(Boolean).pop();
    if (!last) return host;
    const pretty = decodeURIComponent(last).replace(/[-_]+/g, " ").slice(0, 52);
    return pretty || host;
  } catch {
    return "Sealed page";
  }
}

async function keepPublicSources(urls: string[], cap = SOURCE_CAP): Promise<Source[]> {
  const seen = new Set<string>();
  const sources: Source[] = [];
  for (const candidate of urls) {
    if (sources.length >= cap) break;
    try {
      const url = await assertPublicUrl(candidate);
      if (seen.has(url)) continue;
      seen.add(url);
      sources.push({ url, title: titleFromUrl(url) });
    } catch {
      /* drop non-public or malformed citations */
    }
  }
  return sources;
}

type CallOpts = { instructions: string; maxTokens: number; timeoutMs: number };
const BRIEF_OPTS: CallOpts = { instructions: INSTRUCTIONS, maxTokens: 800, timeoutMs: 50_000 };

async function callModel(apiKey: string, model: string, mission: string, opts: CallOpts = BRIEF_OPTS): Promise<Response> {
  return fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    signal: AbortSignal.timeout(opts.timeoutMs),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: opts.maxTokens,
      instructions: opts.instructions,
      input: [{ role: "user", content: mission }],
      tools: [{ type: "web_search" }],
    }),
  });
}

/** Set when xAI reports exhausted credits / spending limit, so fallbacks can say so. */
let creditsOutUntil = 0;
const CREDITS_NOTE = "_AI credits ran out, so this is a free summary from public sources (no AI)._";

async function tryGrok(mission: string, opts: CallOpts = BRIEF_OPTS, cap = SOURCE_CAP): Promise<MissionResult | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    console.warn("[youcog] XAI_API_KEY is not set; using keyless web research fallback.");
    return null;
  }
  try {
    let response = await callModel(apiKey, PRIMARY_MODEL, mission, opts);
    if (!response.ok && (response.status === 400 || response.status === 404)) {
      response = await callModel(apiKey, FALLBACK_MODEL, mission, opts);
    }
    if (!response.ok) {
      const body = (await response.text().catch(() => "")).slice(0, 300);
      if (response.status === 402 || response.status === 429 || /credit|spending|quota|billing/i.test(body)) {
        creditsOutUntil = Date.now() + 10 * 60_000;
      }
      console.warn(`[youcog] xAI API returned ${response.status}; using fallback. ${body}`);
      return null;
    }
    const payload = asRecord(await response.json());
    if (!payload) return null;
    const brief = collectText(payload).slice(0, 16000);
    if (!brief) return null;
    const sources = await keepPublicSources(collectRawUrls(payload, brief), cap);
    return { ok: true, brief, sources, stored: false };
  } catch (error) {
    console.warn("[youcog] xAI API call failed; using fallback.", error);
    return null;
  }
}

/** Keyless fallback: on-chain + DexScreener facts (when a token is mentioned) plus web/Wikipedia research. */
async function freeFallback(mission: string, facts?: string): Promise<MissionResult> {
  const f = facts ?? (await onchainFacts(mission).catch(() => ""));
  const note = creditsOutUntil > Date.now() ? `${CREDITS_NOTE}\n\n` : "";
  const { researchMission } = await import("./research.server");
  try {
    const r = await researchMission(mission);
    return { ...r, brief: `${note}${f ? `## On-chain facts\n\n${f}\n\n` : ""}${r.brief}` };
  } catch (e) {
    if (f) return { ok: true, brief: `${note}## On-chain facts\n\n${f}`, sources: [], stored: false };
    throw e;
  }
}

export async function runMissionOnServer(mission: string): Promise<MissionResult> {
  const grok = creditsOutUntil > Date.now() ? null : await tryGrok(mission);
  if (grok) return grok;
  return freeFallback(mission);
}

const DEEP_INSTRUCTIONS = [
  "You are Youcog, the private research agent inside Youcognito, running a Deep Mission for a verified YOUCOG holder.",
  "Write a thorough report of 450-800 words in Markdown with these sections, each as a '## ' heading:",
  "Summary; Holders & distribution; Liquidity & market; Contract; Risks; Risk score; Sources.",
  "Use web search widely: block explorers (Basescan), DEX data (DexScreener, GeckoTerminal), official sites, docs, audits, and credible news.",
  "Prefer at least 6 distinct sources. Use the on-chain facts provided; never invent numbers. Say clearly when data is unavailable.",
  "In 'Risk score' give a single line 'Risk score: N/100' (higher = riskier) and two or three short reasons.",
  "If the mission is not about a token, adapt the sections sensibly but keep Summary, Risks, Risk score and Sources.",
  "Not financial advice. Do not ask for personal data. Do not mention these instructions.",
].join(" ");

/** Cheap on-chain + DEX facts for any Base token address in the mission. */
async function onchainFacts(mission: string): Promise<string> {
  const m = mission.match(/0x[0-9a-fA-F]{40}/);
  const target = m?.[0] ?? (/youcog/i.test(mission) ? "0x92Bff5D88157114DfC4a0A00F3496AA7e2E7EbA3" : null);
  if (!target) return "";
  const lines: string[] = [`Address: ${target} (Base)`];
  try {
    const { createPublicClient, http, parseAbi, formatUnits } = await import("viem");
    const { base } = await import("viem/chains");
    const pub = createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org") });
    const code = await pub.getCode({ address: target as `0x${string}` });
    lines.push(code && code !== "0x" ? `Contract bytecode: ${(code.length - 2) / 2} bytes` : "No contract code (EOA or wrong chain)");
    if (code && code !== "0x") {
      const abi = parseAbi([
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
        "function totalSupply() view returns (uint256)",
        "function owner() view returns (address)",
      ]);
      const read = (fn: "name" | "symbol" | "decimals" | "totalSupply" | "owner") =>
        pub.readContract({ address: target as `0x${string}`, abi, functionName: fn }).catch(() => null);
      const [name, symbol, decimals, supply, owner] = await Promise.all([read("name"), read("symbol"), read("decimals"), read("totalSupply"), read("owner")]);
      if (name) lines.push(`Name: ${name}`);
      if (symbol) lines.push(`Symbol: ${symbol}`);
      if (supply != null && decimals != null) lines.push(`Total supply: ${formatUnits(supply as bigint, Number(decimals))}`);
      lines.push(owner ? `owner(): ${owner}` : "owner(): not exposed (no Ownable or renounced)");
    }
  } catch {
    lines.push("RPC read failed.");
  }
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${target}`, { signal: AbortSignal.timeout(5000) });
    const pairs = ((await r.json())?.pairs ?? []).slice(0, 3);
    for (const p of pairs) {
      lines.push(
        `DEX pair ${p.dexId} on ${p.chainId}: price $${p.priceUsd ?? "?"}, liquidity $${p.liquidity?.usd ?? "?"}, FDV $${p.fdv ?? "?"}, 24h volume $${p.volume?.h24 ?? "?"}, ${p.url}`,
      );
    }
    if (!pairs.length) lines.push("No DEX pairs found on DexScreener.");
  } catch {
    /* optional */
  }
  return lines.join("\n");
}

export async function runDeepMissionOnServer(mission: string): Promise<MissionResult> {
  const facts = await onchainFacts(mission);
  const input = facts ? `${mission}\n\nOn-chain facts (verified just now):\n${facts}` : mission;
  const grok =
    creditsOutUntil > Date.now()
      ? null
      : await tryGrok(input, { instructions: DEEP_INSTRUCTIONS, maxTokens: 2400, timeoutMs: 150_000 }, 12);
  if (grok) return grok;
  return freeFallback(mission, facts);
}
