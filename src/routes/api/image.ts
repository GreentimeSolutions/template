import { createFileRoute } from "@tanstack/react-router";

const PER_USER = Number(process.env.IMAGE_PER_USER_DAILY ?? 1);
const GLOBAL = Number(process.env.IMAGE_GLOBAL_DAILY ?? 10);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

/** FLUX 3 Image Klein via the BFL API at 768x768 ($0.008 / image). Disabled until BFL_API_KEY is set. */
export const Route = createFileRoute("/api/image")({
  server: {
    handlers: {
      GET: async () => {
        const { usedToday, ctDay } = await import("@/lib/youcog/ai-quota.server");
        const used = await usedToday("image", ctDay()).catch(() => 0);
        return json({ enabled: Boolean(process.env.BFL_API_KEY?.trim()), perUser: PER_USER, total: GLOBAL, left: Math.max(GLOBAL - used, 0) });
      },
      POST: async ({ request }) => {
        const key = process.env.BFL_API_KEY?.trim();
        if (!key) return json({ ok: false, reason: "Image making isn't turned on yet." }, 503);
        let idea = "";
        try {
          idea = String(((await request.json()) as { prompt?: string }).prompt ?? "").replace(/\s+/g, " ").trim();
        } catch {
          /* bad body */
        }
        if (idea.length < 3 || idea.length > 300) return json({ ok: false, reason: "Describe your image in a few words (under 300 characters)." }, 400);
        const { takeQuota, refundQuota, whoFromRequest, ctDay } = await import("@/lib/youcog/ai-quota.server");
        const who = whoFromRequest(request);
        const day = ctDay();
        const denied = await takeQuota("image", who, PER_USER, GLOBAL, day).catch(() => "Image making is busy. Try again later.");
        if (denied) return json({ ok: false, reason: denied.replace(/midnight UTC|tomorrow \(resets midnight UTC\)/, "midnight CT") }, 429);
        try {
          const prompt = `Fun, colorful meme-style art for YOUCOG, a privacy-themed crypto token on Base (incognito ghost mascot vibe). ${idea}. No real people, safe for work.`;
          const sub = await fetch("https://api.bfl.ai/v1/flux-3-image-klein", {
            method: "POST",
            headers: { "x-key": key, "content-type": "application/json", accept: "application/json" },
            body: JSON.stringify({ prompt, resolution: "768sq", aspect_ratio: "1:1", output_format: "jpeg" }),
          });
          const s = (await sub.json()) as { polling_url?: string; id?: string };
          if (!sub.ok || !s.polling_url) throw new Error(`submit ${sub.status}`);
          const until = Date.now() + 50_000;
          while (Date.now() < until) {
            await new Promise((r) => setTimeout(r, 1500));
            const p = (await (await fetch(s.polling_url, { headers: { "x-key": key, accept: "application/json" } })).json()) as {
              status?: string;
              result?: { sample?: string };
            };
            if (p.status === "Ready" && p.result?.sample) return json({ ok: true, url: p.result.sample });
            if (p.status && /error|failed|moderated/i.test(p.status)) throw new Error(p.status);
          }
          throw new Error("timeout");
        } catch (e) {
          console.warn("[youcog] image failed", e);
          await refundQuota("image", who, day).catch(() => {});
          return json({ ok: false, reason: "Couldn't make that image. Try a different idea." }, 502);
        }
      },
    },
  },
});
