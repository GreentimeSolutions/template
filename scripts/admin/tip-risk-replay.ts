/**
 * usage: DATABASE_URL=... NEYNAR_API_KEY=... node scripts/admin/tip-risk-replay.ts
 * Replays the spam checks over recorded tips (log-only). See src/lib/youcog/tip-risk-replay.server.ts.
 */
import pg from "pg";
import { replay } from "../../src/lib/youcog/tip-risk-replay.server.ts";
import type { AnonTipsSql } from "../../src/lib/youcog/anon-tips.server.ts";

const client = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
  return (await client.query(text, values)).rows;
}) as AnonTipsSql;
const res = await replay(sql, process.env.NEYNAR_API_KEY?.trim(), Number(process.env.CLAIM_AMOUNT ?? 215225));
console.log(JSON.stringify(res, null, 2));
await client.end();
