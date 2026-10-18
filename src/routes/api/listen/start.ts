import { createFileRoute } from "@tanstack/react-router";
import { allowListen, listenJson, readJson, resolveListenIdentity } from "@/lib/youcog/listen-identity.server";

export const Route = createFileRoute("/api/listen/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await readJson(request);
        const who = await resolveListenIdentity(request, body.address);
        if (!who.ok) return listenJson(who.status, { ok: false, reason: who.reason });
        if (!allowListen(`start:${who.identity}`, 6) || !allowListen(`ip:${who.ip}`, 20)) {
          return listenJson(429, { ok: false, reason: "Slow down a little and try again." });
        }
        const source = typeof body.source === "string" ? body.source : "local";
        const { getSql } = await import("@/lib/db");
        const { startListen } = await import("@/lib/youcog/listen.server");
        try {
          return listenJson(200, await startListen(await getSql(), who.identity, source));
        } catch {
          return listenJson(503, { ok: false, reason: "Couldn't start the listen. Try again." });
        }
      },
    },
  },
});
