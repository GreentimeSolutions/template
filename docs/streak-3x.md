# 3x claim on every 7th straight day

Approved by Andy on 2026-10-29. Preview only until he says go.

## Rule
- Streak = consecutive UTC days with a sent faucet claim (per Farcaster FID in the Mini App, per address on the web). Missing a day resets it to 1 (unchanged).
- Regular multipliers are unchanged: 1x days 1-2, 1.25x days 3-6, 1.5x day 7+.
- On day 7, 14, 21, ... the claim pays **3x the chosen tier** instead of that day's 1.5x (it replaces it, it doesn't stack).

| Tier | Day 6 (1.25x) | Day 7 (3x) | Day 8 (1.5x) | Day 14 (3x) |
|---|---|---|---|---|
| 840 | 1,050 | 2,520 | 1,260 | 2,520 |
| 2,222 | 2,778 | 6,666 | 3,333 | 6,666 |
| 13,938 | 17,423 | 41,814 | 20,907 | 41,814 |

## Interactions
- **Listen boost:** still a flat 100,000 that replaces the claim when it is bigger (it is bigger than any 3x day), unchanged.
- **Save bonus:** unchanged rule, 10% of the amount actually sent, so a 3x day's claim earns its save bonus on the 3x amount (e.g. 41,814 -> 4,181).
- **Limits:** same one claim per person per day, the daily claim cap, and the daily token budget (`FAUCET_DAILY_TOKEN_BUDGET`, default 500,000) all apply. The balance check uses the final 3x amount. If the 3x amount doesn't fit today's budget or the faucet balance, the claim falls back to the regular streak amount instead of failing.
- **Server-side:** the streak is computed from sent claims in the database at claim time; the client only picks a tier.

## Code
- `src/lib/youcog/streak-core.ts` pure rules (multiplier, cycle day, counter label), shared by server and UI.
- `src/lib/youcog/faucet.server.ts` claim path and `/api/streak` (adds `nextIsBonusDay`). Response adds `streakBonus`.
- `src/components/youcog/faucet.tsx` streak counter (7 pips, "Day 6 of 7 — claim tomorrow for 3x", "Day 7: 3x claim!"). Same card in web and Mini App.
- No schema change (the 3x day is derivable from `faucet_claims.streak`).

## Verify
`npm run test:streak`, `npx tsc --noEmit`, eslint.
