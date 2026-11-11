# Youcognito tips: spam checks and tamper-evident ledger

## Flags (all default OFF)

| Flag | Default | Effect |
|---|---|---|
| `TIPS_RISK_MODE` | `off` | `log`: compute risk on every tip, record flags (`anon_tips.risk_flags` + a `shadow` row in `tip_risk_reviews`) and log, never block. `enforce`: deny / hold / points-hold. `TIPS_RISK_ON=1` alone = `log`. |
| `LEDGER_ON` | unset | Read at deploy (scripts/migrate.mjs). `1` = backfill existing rows (genesis first) and turn the hash chain on. `0` = turn it off. Unset = leave as is (fresh DBs start off). |
| `LEDGER_ANCHOR_ON` | off | Daily cron builds the Base anchor calldata (dry-run, nothing sent). |
| `LEDGER_ANCHOR_SEND` | off | Also send the anchor tx, only if `LEDGER_ANCHOR_PRIVATE_KEY` (a dedicated, separately funded wallet, never the faucet key) is set. |
| `CRON_SECRET` | unset | Required by both cron routes (fail closed). |
| `ADMIN_FIDS` | `209707` | Who can use `/api/admin/tip-reviews`. |

Thresholds (env, defaults): `TIPS_RISK_MIN_SCORE` 0.55, `TIPS_RISK_SOFT_SCORE` 0.70, `TIPS_RISK_MIN_AGE_DAYS` 30,
`TIPS_RISK_MIN_FOLLOWERS` 50, `TIPS_RISK_MAX_FOLLOW_RATIO` 20, `TIPS_RECIPROCAL_DAYS` 14, `TIPS_PAIR_REPEAT_DAYS` 7,
`TIPS_RECIPIENT_DAILY_COUNT` 3, `TIPS_RECIPIENT_DAILY_CLAIMS` 5 (x claim), `TIPS_GLOBAL_DAILY_CAP` 40,
`TIPS_GLOBAL_DAILY_CLAIMS` 40 (x claim), `TIPS_BURST_PER_HOUR` 3, `TIPS_POINTS_HOLD_DAYS` 7, `TIPS_HOLD_EXPIRE_DAYS` 7,
`NEYNAR_CACHE_HOURS` 24.

## Rules

- Deny: D1 self tip; D2 sender and recipient share a verified/custody/primary address (Neynar + Farcaster API) or the payout
  address is the sender's; D3 payout address appears in the sender's own faucet claims, or is the faucet wallet.
- Hold whole tip: H0 Neynar unavailable; H1 score < 0.55 (either side, missing score = hold); H2 account < 30 days;
  H3 recipient tipped sender in last 14 days; H4 recipient wallet claimed under another fid, or shared web-claim ip_hash;
  H5 same pair within 7 days; H6 recipient already got >= 3 tips or > 5x claim today; H7 app-wide >= 40 tips or > 40x claim today.
- Points-only hold (tip sends, points pending 7 days): P1 score 0.55-0.70; P2 < 50 followers or following/followers > 20; P3 >= 3 tips in the last hour.

Held tips reserve the amount (status `held`), nothing is sent or cast. Admin approve -> send + cast -> `sent` (or `dry_run`
when TIPS_LIVE is off), points credited. Reject/expire (7 days) -> amount back, points void. Cron `/api/cron/tip-risk-sweep`
(daily, enforce mode only) expires held tips and releases points whose hold ended.

Admin API (Quick Auth, ADMIN_FIDS only): `GET /api/admin/tip-reviews` (queue, no sender fids) and
`POST /api/admin/tip-reviews {tipId, action: approve|reject|void_points|release_points, note?}`.

## Ledger spec (for auditors, e.g. nito DAO)

- Table `ledger_events(seq, event_type, ref_table, ref_id, payload, created_at, prev_hash, hash)`; written only by DB triggers
  on `anon_tips`, `gift_points_ledger`, `tip_balance_adjustments`, `tip_risk_reviews`, in the same transaction as the source row.
- `hash = sha256(utf8(seq + "\n" + event_type + "\n" + payload + "\n" + hex(prev_hash)))`; genesis (seq 0) prev = 32 zero bytes.
  `payload` is the exact hashed text (JSON). `seq` is gapless; `prev_hash` is unique, so forks cannot commit.
- Event types: genesis, tip.created, tip.status, points.created, points.state, balance.adjust, review.decision.
- Privacy: payloads never contain sender fids. `sender_commit`/`fid_commit = sha256(hex(salt) + ":" + fid)` with a random per-event
  salt in the private `ledger_salts` table; notes on balance credits are committed the same way.
- Append-only: UPDATE/DELETE/TRUNCATE on ledger tables always raise. While the ledger is on, source rows cannot be deleted and only
  status/review/state fields can change (each change is itself chained). Corrections are new rows.
- Honest limit: the app's database owner role could drop triggers, so this is tamper-evident, not tamper-proof. Daily Base anchors
  (when enabled) and a later least-privilege app role close that gap.

Verify:

```
node scripts/ledger-verify.mjs --url https://youcognito.com          # chain + on-chain tip transfers + last anchor
node scripts/ledger-verify.mjs --file export.ndjson --no-chain
DATABASE_URL=<auditor role> node scripts/ledger-verify.mjs --url ... --full   # open commitments, no unlogged rows, totals
```

Public endpoints: `GET /api/ledger/head`, `GET /api/ledger/export?from_seq=0&limit=500[&check=1]` (NDJSON).
Anchor calldata: `"YCOGLEDGER1" || seq (uint64 BE) || head hash (32 bytes) || ERC-8021 builder suffix`, 0-value self-transfer on Base.
