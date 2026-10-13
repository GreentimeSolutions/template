import { createFileRoute } from "@tanstack/react-router";
import { holderFromRequest, json } from "@/lib/youcog/holder-http.server";

const hits = new Map<string, number[]>();
function allow(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
  if (list.length >= limit) return false;
  list.push(now);
  hits.set(key, list);
  return true;
}

/** Holder-only Deep Mission. Enforced here: proof of ownership + live balance check on every request. */
export const Route = createFileRoute("/api/deep-mission")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let mission = "";
        try {
          mission = String(((await request.json()) as { mission?: string }).mission ?? "").trim();
        } catch {
          /* bad body */
        }
        if (mission.length < 2 || mission.length > 600) return json({ ok: false, reason: "Write a mission of a few words." }, 400);
        const st = await holderFromRequest(request).catch(() => null);
        if (!st?.who) return json({ ok: false, locked: true, reason: "Verify your wallet to use Deep Mission." }, 401);
        if (!st.holder)
          return json(
            { ok: false, locked: true, reason: `Deep Mission is for holders of ${st.min.toLocaleString()} YOUCOG.`, balance: st.balance, min: st.min },
            403,
          );
        // Holders get a higher limit: 20 Deep Missions per 10 minutes each (vs 6/10 min shared for regular missions).
        if (!allow(st.who, 20, 10 * 60_000)) return json({ ok: false, reason: "Slow down a little. Try again in a few minutes." }, 429);
        const { runDeepMissionOnServer } = await import("@/lib/youcog/agent.server");
        return json({ ...(await runDeepMissionOnServer(mission)), deep: true });
      },
    },
  },
});
