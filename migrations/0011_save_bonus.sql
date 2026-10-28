-- Save bonus: a faucet claim whose YOUCOG is still held 7 days later can earn +10% of that claim, once.
-- Numbered 0011 so it sorts after the Forge branch's 0009/0010 when those merge.
create table if not exists save_bonuses (
  id bigserial primary key,
  claim_id bigint not null references faucet_claims (id),
  day date not null,                 -- UTC day the bonus was paid (counts toward faucet_days.tokens)
  address text not null,             -- the claim's address (bonus is always paid there)
  fid bigint,
  claim_amount integer not null,     -- faucet_claims.amount at check time
  amount integer not null,           -- bonus paid (10% of claim_amount, rounded down)
  balance_wei text,                  -- balanceOf(address) read at check time, for audit
  status text not null default 'pending', -- pending | sent | failed
  tx_hash text,
  error text,
  created_at timestamptz not null default now()
);
-- Once per claim: a failed payout frees the slot so it can be retried.
create unique index if not exists save_bonuses_claim on save_bonuses (claim_id) where status <> 'failed';
create index if not exists save_bonuses_address on save_bonuses (address);
