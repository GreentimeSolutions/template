import { createFileRoute } from "@tanstack/react-router";
import { allowListen, listenJson, readJson, resolveListenIdentity } from "@/lib/youcog/listen-identity.server";

export const Route = createFileRoute("/api/listen/status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await readJson(request);
        const who = await resolveListenIdentity(request, body.address);
        if (!who.ok) return listenJson(200, { unlocked: false, used: false });
        if (!allowListen(`status:${who.ip || who.identity}`, 30)) return listenJson(429, { unlocked: false, used: false });
        const { getSql } = await import("@/lib/db");
        const { listenStatus } = await import("@/lib/youcog/listen.server");
        try {
          return listenJson(200, await listenStatus(await getSql(), who.identity));
        } catch {
          return listenJson(200, { unlocked: false, used: false });
        }
      },
    },
  },
});
