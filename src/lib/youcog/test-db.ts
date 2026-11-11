/** PGlite with every migration applied, for node:test integration tests. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { AnonTipsSql } from "./anon-tips.server.ts";

export async function testDb(): Promise<{ sql: AnonTipsSql; pg: PGlite }> {
  const pg = new PGlite({ parsers: { 20: Number, 1082: (v: string) => v } });
  const dir = join(process.cwd(), "migrations");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
    await pg.exec(readFileSync(join(dir, f), "utf8"));
  }
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ""), "");
    return (await pg.query(text, values)).rows;
  }) as AnonTipsSql;
  return { sql, pg };
}
