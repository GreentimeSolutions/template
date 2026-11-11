import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/youcog/holder-http.server";

/**
 * Optional daily Base anchor of the ledger head. OFF by default:
 *   LEDGER_ANCHOR_ON=1        build the anchor (dry-run: returns calldata, sends nothing)
 *   LEDGER_ANCHOR_SEND=1      additionally send, only if LEDGER_ANCHOR_PRIVATE_KEY is set
 * Uses a dedicated anchor wallet key, never the faucet key. No wallet is created here.
 */
export const Route = createFileRoute("/api/cron/ledger-anchor")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { cronAuthorized } = await import("@/lib/youcog/cron-auth.server");
        if (!cronAuthorized(request)) return json({ ok: false, reason: "unauthorized" }, 401);
        const { envFlag } = await import("@/lib/youcog/anon-tips-core");
        const enabled = envFlag(process.env.LEDGER_ANCHOR_ON);
        if (!enabled) return json({ ok: false, reason: "anchoring is off (LEDGER_ANCHOR_ON)" });
        const key = process.env.LEDGER_ANCHOR_PRIVATE_KEY?.trim();
        const send = envFlag(process.env.LEDGER_ANCHOR_SEND) && Boolean(key);
        const { getSql } = await import("@/lib/db");
        const { DATA_SUFFIX } = await import("@/lib/youcog/builder-code");
        const { runLedgerAnchor } = await import("@/lib/youcog/ledger.server");
        let sendAnchorTx: ((data: `0x${string}`) => Promise<`0x${string}`>) | undefined;
        if (send && key) {
          sendAnchorTx = async (data) => {
            const { createWalletClient, http } = await import("viem");
            const { privateKeyToAccount } = await import("viem/accounts");
            const { base } = await import("viem/chains");
            const account = privateKeyToAccount(key as `0x${string}`);
            const wallet = createWalletClient({ account, chain: base, transport: http(process.env.BASE_RPC_URL?.trim() || undefined) });
            return wallet.sendTransaction({ to: account.address, value: 0n, data });
          };
        }
        try {
          return json(await runLedgerAnchor({ sql: await getSql(), enabled, dryRun: !send, dataSuffix: DATA_SUFFIX, sendAnchorTx }));
        } catch (err) {
          console.error("[ledger-anchor]", (err instanceof Error ? err.message : String(err)).slice(0, 200));
          return json({ ok: false, reason: "anchor failed" }, 500);
        }
      },
    },
  },
});
