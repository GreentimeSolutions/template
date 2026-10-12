import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const READ_CAP = 350_000;
const HOP_LIMIT = 4;

export type PageRead = {
  ok: true;
  url: string;
  title: string;
  text: string;
};

export type PageFail = { ok: false; error: string };

function privateIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:")) return privateIp(lower.slice(7));
  const v4 = lower.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80")) return true;
  return false;
}

function blockedHost(host: string): boolean {
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    return true;
  }
  if (host.endsWith(".localhost") || host === "metadata.google.internal") return true;
  return false;
}

export async function assertPublicUrl(raw: string): Promise<string> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("That is not a web address.");
  }
  if (url.username || url.password) {
    throw new Error("Addresses with a login are blocked.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only ordinary web pages can be sealed.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new Error("Only standard web ports can be sealed.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (blockedHost(host)) throw new Error("Only public web pages can be sealed.");

  let ips: string[] = [];
  try {
    ips = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true })).map((row) => row.address);
  } catch {
    throw new Error("That address could not be found.");
  }
  if (ips.length === 0 || ips.some(privateIp)) {
    throw new Error("Only public web pages can be sealed.");
  }

  url.hostname = host;
  url.hash = "";
  return url.toString();
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    size += value.byteLength;
    if (size > READ_CAP) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(Math.min(size, READ_CAP));
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, merged.length - offset);
    merged.set(slice, offset);
    offset += slice.byteLength;
    if (offset >= merged.length) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, n: string) => {
      const code = Number(n);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => {
      const code = Number.parseInt(n, 16);
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&/gi, "&")
    .replace(/</gi, "<")
    .replace(/>/gi, ">")
    .replace(/"/gi, '"')
    .replace(/&#39;|'/gi, "'");
}

export function htmlToReader(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = decodeEntities(titleMatch?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  const stripped = html
    .replace(/<(script|style|noscript|svg|header|nav|footer|aside|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const main = stripped.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i);
  const chunk = main?.[2] ?? stripped;
  const text = decodeEntities(
    chunk
      .replace(/<(br|\/p|\/div|\/h[1-6]|\/li|\/tr|\/section)\b[^>]*>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 12_000);
  return { title: title || "Untitled page", text };
}

export async function readPublicPage(raw: string): Promise<PageRead> {
  let current = await assertPublicUrl(raw);
  for (let hop = 0; hop < HOP_LIMIT; hop += 1) {
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("The page redirected without a destination.");
      current = await assertPublicUrl(new URL(location, current).toString());
      continue;
    }
    if (res.status === 401 || res.status === 403 || res.status === 429) {
      throw new Error("This site refused a cookieless read.");
    }
    if (!res.ok) throw new Error("The page could not be read.");
    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
      throw new Error("That address is not a readable page.");
    }
    const html = await readCapped(res);
    const reader = htmlToReader(html);
    if (!reader.text) throw new Error("The page had no readable text.");
    return { ok: true, url: current, title: reader.title, text: reader.text };
  }
  throw new Error("The page redirected too many times.");
}
