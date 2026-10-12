import { readPublicPage } from "./reader.server";
import type { MissionResult, Source } from "./types";

const PAGE_CAP = 4;
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const STOP = new Set([
  "what",
  "when",
  "where",
  "which",
  "that",
  "this",
  "with",
  "from",
  "your",
  "about",
  "have",
  "does",
  "how",
  "why",
  "into",
  "than",
  "then",
  "them",
  "they",
  "will",
  "just",
  "like",
  "some",
  "more",
  "most",
  "also",
  "been",
  "were",
  "would",
  "could",
  "should",
  "there",
  "their",
  "tell",
  "explain",
  "please",
]);

type Hit = { url: string; title: string; snippet: string };

function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const last = parsed.pathname.replace(/\/$/, "").split("/").filter(Boolean).pop();
    if (!last) return host;
    return decodeURIComponent(last).replace(/[-_]+/g, " ").slice(0, 52) || host;
  } catch {
    return "Sealed page";
  }
}

function decode(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&/gi, "&")
    .replace(/"/gi, '"')
    .replace(/&#39;|'/gi, "'")
    .replace(/</gi, "<")
    .replace(/>/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

function clean(value: string): string {
  return decode(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unwrap(href: string): string | null {
  const raw = decode(href).trim();
  const absolute = raw.startsWith("//") ? `https:${raw}` : raw;
  try {
    const url = new URL(absolute);
    const nested = url.searchParams.get("uddg");
    const target = nested ? new URL(nested) : url;
    if (target.protocol !== "https:" && target.protocol !== "http:") return null;
    const host = target.hostname.replace(/^www\./, "");
    if (host.endsWith("duckduckgo.com") || host.endsWith("duck.com")) return null;
    if (/\.(pdf|zip|png|jpe?g|gif|mp4|mp3|webp)$/i.test(target.pathname)) return null;
    target.hash = "";
    return target.toString();
  } catch {
    return null;
  }
}

function parseDuck(html: string): Hit[] {
  const hits: Hit[] = [];
  const seen = new Set<string>();
  const pattern =
    /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|span)>/g;
  for (const match of html.matchAll(pattern)) {
    const url = unwrap(match[1]);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    hits.push({ url, title: clean(match[2]).slice(0, 140), snippet: clean(match[3]).slice(0, 400) });
    if (hits.length >= PAGE_CAP + 2) break;
  }
  return hits;
}

async function searchDuck(query: string): Promise<Hit[]> {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { Accept: "text/html", "User-Agent": UA },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  return parseDuck(await res.text());
}

function blockedPage(text: string): boolean {
  const sample = text.replace(/\s+/g, " ").trim().slice(0, 280);
  return /one moment|enable javascript|are you a robot|captcha|access denied|just a moment|verify you are human/i.test(
    sample,
  );
}

function leadText(text: string): string {
  return text
    .split(/\n\n+/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 80)
    .filter((part) => !/^(home|menu|search|sign in|subscribe|cookie|skip to)\b/i.test(part))
    .filter((part) => !blockedPage(part))
    .slice(0, 2)
    .join(" ");
}

function terms(question: string): string[] {
  const words = question.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
  return [...new Set(words.filter((word) => !STOP.has(word)))];
}

function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 60 && line.length <= 320 && /[a-z]/i.test(line));
}

function writeBrief(question: string, pages: Array<Hit & { extract: string }>): string {
  const keys = terms(question);
  const scored: Array<{ text: string; score: number }> = [];
  const seen = new Set<string>();
  for (const page of pages) {
    for (const sentence of sentencesOf(page.extract || page.snippet)) {
      const stamp = sentence.slice(0, 80).toLowerCase();
      if (seen.has(stamp)) continue;
      const lower = sentence.toLowerCase();
      let score = keys.reduce((total, key) => total + (lower.includes(key) ? 2 : 0), 0);
      if (/\bis (a|an)\b/.test(lower)) score += 8;
      else if (/\b(is|are|means|refers to|lets you|allows)\b/.test(lower)) score += 3;
      if (/\b(this guide|in this guide|this article|learn how|click here|sign up|walks you)\b/.test(lower)) {
        score -= 6;
      }
      if (keys.length > 0 && score < 2) continue;
      seen.add(stamp);
      scored.push({ text: sentence, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const chosen: string[] = [];
  let words = 0;
  for (const row of scored) {
    const count = row.text.split(/\s+/).length;
    if (chosen.length > 0 && words + count > 150) break;
    chosen.push(row.text);
    words += count;
    if (chosen.length >= 4) break;
  }
  if (chosen.length === 0) {
    for (const page of pages) {
      if (page.snippet && !blockedPage(page.snippet)) chosen.push(page.snippet);
      if (chosen.length >= 2) break;
    }
  }
  const body = chosen.join(" ");
  const cites = pages.map((page) => `[${page.title || titleFromUrl(page.url)}](${page.url})`).join(" ");
  if (!body) return cites;
  return `${body}\n\n${cites}`;
}

export async function researchMission(mission: string): Promise<MissionResult> {
  let hits: Hit[] = [];
  try {
    hits = await searchDuck(mission);
  } catch {
    hits = [];
  }
  if (hits.length === 0) {
    throw new Error("Youcog could not reach the web just now. You can still open a sealed tab by address.");
  }

  const read = await Promise.all(
    hits.slice(0, PAGE_CAP + 2).map(async (hit) => {
      try {
        const page = await readPublicPage(hit.url);
        const extract = leadText(page.text);
        if (!extract || blockedPage(page.text)) return null;
        return {
          url: page.url,
          title: page.title || hit.title || titleFromUrl(page.url),
          snippet: hit.snippet,
          extract,
        };
      } catch {
        return null;
      }
    }),
  );

  const pages = read.filter((page): page is Hit & { extract: string } => page !== null).slice(0, PAGE_CAP);
  if (pages.length === 0) {
    throw new Error("Youcog found pages, but none of them could be read. Try opening an address yourself.");
  }
  const sources: Source[] = pages.map((page) => ({
    url: page.url,
    title: page.title || titleFromUrl(page.url),
  }));
  const brief = writeBrief(mission, pages).slice(0, 6000);
  if (!brief.trim()) throw new Error("Youcog found pages, but none of them had a readable answer.");
  return { ok: true, brief, sources, stored: false };
}
