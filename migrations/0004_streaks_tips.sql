-- Claim streaks: record the chosen base amount and streak; `amount` stays the amount actually sent (incl. bonus).
alter table faucet_claims add column if not exists base_amount integer;
alter table faucet_claims add column if not exists streak integer not null default 1;
create index if not exists faucet_claims_fid_sent on faucet_claims (fid, day) where status = 'sent';
create index if not exists faucet_claims_addr_sent on faucet_claims (address, day) where status = 'sent';
-- Daily token budget (bonus counts toward it) alongside the claim-count cap.
alter table faucet_days add column if not exists tokens bigint not null default 0;

-- Tips sent through the Support widget, verified on-chain before recording.
create table if not exists tips (
  tx_hash text primary key,
  from_address text not null,
  token text not null, -- ETH | USDC
  amount numeric not null, -- in whole units (ETH or USDC)
  fid bigint,
  created_at timestamptz not null default now()
);
