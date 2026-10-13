import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/youcog/holder-http.server";
import { domainFromRequest } from "@/lib/youcog/miniapp";

export const Route = createFileRoute("/api/holder-nonce")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { address } = (await request.json()) as { address?: string };
          const { issueChallenge } = await import("@/lib/youcog/holder.server");
          return json(issueChallenge(String(address ?? ""), domainFromRequest(request)));
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : "Bad request." }, 400);
        }
      },
    },
  },
});
