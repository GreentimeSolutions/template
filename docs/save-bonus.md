# Save bonus (+10%)

Approved by Andy on 2026-10-27. Deployed to production 2026-10-27 by Vercel CLI from local branch `save-bonus` (not yet on GitHub).

## What it does
A faucet claim whose YOUCOG is still in the receiving wallet 7 days later can collect an
extra 10% of that claim (the amount actually sent, streak and listen boost included,
rounded down), once per claim. The user taps **Claim save bonus** in the faucet card.

| Claim | Save bonus |
|---|---|
| 840 | 84 |
| 2,222 | 222 |
| 13,938 | 1,393 |
| 20,907 (1.5x streak) | 2,090 |
| 100,000 (listen boost) | 10,000 |

## How the check works
1. `GET /api/save-bonus` (Quick Auth FID in the Mini App, `?address=` on the web) lists the
   identity's sent claims with no live save bonus yet: ready (7 to 37 days old), the next unlock time.
2. `POST /api/save-bonus` groups ready claims by the address they were sent to and checks each address:
   - **now:** `balanceOf(address)` must be at least the total claimed being settled for it;
   - **through the week:** `balanceOf` at past Base blocks at each claim's day 1..7 marks (merged within 6h,
     max 24) plus 2 random times in the span. At each checkpoint the wallet must hold every claim still inside
     its own 7-day window then (claims past their 7 days are free to spend). Historical reads go to
     `BASE_RPC_URL`, falling back to the public Base RPC; any failed read pays nothing (fails closed).
   Only addresses that pass are paid. One transfer per address, always back to the claim's own address.
3. Each claim gets a `save_bonuses` row reserved before sending; a unique index on `claim_id`
   (where status <> 'failed') makes it once per claim even with concurrent taps. A failed send marks
   the row failed and frees it.

## Limits it respects
- Same `faucet_days.tokens` daily budget as claims (`FAUCET_DAILY_TOKEN_BUDGET`, default 500,000);
  it doesn't use a daily claim slot.
- Faucet floor: pauses if paying would leave the faucet under 2,000,000 YOUCOG (the listen boost floor).
- Gas check, faucet address excluded, no shared DB on Vercel = closed, rate limit 3/min per identity, 30/min global.
- Collect window: 30 days after unlock (bounds what's owed). Max 14 claims per tap (bounds the payout and the Base reads).

## Turning it on
Off by default. Set `SAVE_BONUS_SINCE` (ISO time, e.g. `2026-11-01T00:00:00Z`) in the Vercel env;
only claims made at or after that time qualify, so there is no back-pay of older claims.
Migration `0011_save_bonus.sql` (numbered after the Forge branch's 0009/0010) runs on deploy.

## Known gaps (honest-check limits)
- Checkpoints are samples, not every block: someone could move tokens out and back between
  checkpoints. The random checkpoints make that hard to time, and the payout is small.
- It checks the balance, not the exact tokens: buying or receiving YOUCOG to cover a sale also passes.
- On the web, anyone can trigger the check for any address; the bonus still goes only to that address.

## Verify
`npm run test:save-bonus` (PGLite + fake chain, 13 tests). `npx tsc --noEmit`, eslint on the new files,
and `vite build` pass.
