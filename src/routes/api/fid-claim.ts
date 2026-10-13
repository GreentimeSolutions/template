import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { APP_DOMAIN } from "@/lib/youcog/miniapp";

const bodySchema = z.object({
  address: z.string().trim().min(1).max(100),
  amount: z.union([z.literal(420), z.literal(1111), z.literal(6969)]),
});

const json = (status: number, body: unknown) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export const Route = createFileRoute("/api/fid-claim")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
        if (!token) return json(401, { ok: false, reason: "Open Youcognito inside Farcaster to claim by account." });

        let fid: number;
        try {
          const { createClient } = await import("@farcaster/quick-auth");
          const payload = await createClient().verifyJwt({
            token,
            domain: process.env.FARCASTER_DOMAIN?.trim() || APP_DOMAIN,
          });
          fid = Number(payload.sub);
          if (!Number.isSafeInteger(fid) || fid <= 0) throw new Error("bad sub");
        } catch {
          return json(401, { ok: false, reason: "Your Farcaster sign-in couldn't be verified. Reopen the app and try again." });
        }

        let body: z.infer<typeof bodySchema>;
        try {
          const parsed = bodySchema.safeParse(await request.json());
          if (!parsed.success) return json(400, { ok: false, reason: "Pick 420, 1111, or 6969 YOUCOG and a Base address." });
          body = parsed.data;
        } catch {
          return json(400, { ok: false, reason: "Bad request." });
        }

        const { claimFromFaucet } = await import("@/lib/youcog/faucet.server");
        const res = await claimFromFaucet({ address: body.address, amount: body.amount, ip: "", fid });
        return json(200, res);
      },
    },
  },
});
