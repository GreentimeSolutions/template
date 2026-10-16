import { createFileRoute } from "@tanstack/react-router";

const MAX_CHARS = 1500;
const PER_USER = Number(process.env.TTS_PER_USER_DAILY ?? 5);
const GLOBAL = Number(process.env.TTS_GLOBAL_DAILY ?? 60);

function speakable(raw: string): string {
  return raw
    .replace(/\[\[\d+\]\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[#*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CHARS);
}

/** Grok Voice: read an answer aloud with xAI TTS ($15 / 1M chars, so at most ~$0.0225 per listen). */
export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const err = (status: number, reason: string) => Response.json({ ok: false, reason }, { status, headers: { "cache-control": "no-store" } });
        const apiKey = process.env.XAI_API_KEY?.trim();
        if (!apiKey) return err(503, "Voice isn't set up yet.");
        let text = "";
        try {
          text = speakable(String(((await request.json()) as { text?: string }).text ?? ""));
        } catch {
          /* bad body */
        }
        if (text.length < 2) return err(400, "Nothing to read.");
        const { takeQuota, refundQuota, whoFromRequest } = await import("@/lib/youcog/ai-quota.server");
        const who = whoFromRequest(request);
        const denied = await takeQuota("tts", who, PER_USER, GLOBAL).catch(() => "Voice is busy. Try again later.");
        if (denied) return err(429, denied);
        try {
          const r = await fetch("https://api.x.ai/v1/tts", {
            method: "POST",
            headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
            body: JSON.stringify({ text, voice_id: "eve", language: "en" }),
            signal: AbortSignal.timeout(45_000),
          });
          if (!r.ok) throw new Error(`tts ${r.status}`);
          return new Response(await r.arrayBuffer(), { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
        } catch (e) {
          console.warn("[youcog] tts failed", e);
          await refundQuota("tts", who).catch(() => {});
          return err(502, "Couldn't make the audio. Try again.");
        }
      },
    },
  },
});
