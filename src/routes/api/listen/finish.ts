import { createFileRoute } from "@tanstack/react-router";
import { allowListen, listenJson, readJson, resolveListenIdentity } from "@/lib/youcog/listen-identity.server";

export const Route = createFileRoute("/api/listen/finish")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await readJson(request);
        const who = await resolveListenIdentity(request, body.address);
        if (!who.ok) return listenJson(who.status, { ok: false, reason: who.reason });
        if (!allowListen(`finish:${who.identity}`, 10)) {
          return listenJson(429, { ok: false, reason: "Slow down a little and try again." });
        }
        const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "";
        if (!sessionId) return listenJson(400, { ok: false, reason: "Missing listen session." });
        const played = typeof body.playedSeconds === "number" ? body.playedSeconds : undefined;
        const { getSql } = await import("@/lib/db");
        const { finishListen } = await import("@/lib/youcog/listen.server");
        try {
          return listenJson(200, await finishListen(await getSql(), { sessionId, identity: who.identity, playedSeconds: played }));
        } catch {
          return listenJson(503, { ok: false, reason: "Couldn't verify the listen. Try again." });
        }
      },
    },
  },
});
