-- Manual tip-balance credits or debits that count toward a sender's available tip allowance.
-- These do not move on-chain tokens; the faucet still pays YOUCOG when a live tip is sent.
create table if not exists tip_balance_adjustments (
  id bigserial primary key,
  fid bigint not null,
  amount integer not null,
  note text not null,
  created_at timestamptz not null default now()
);
create index if not exists tip_balance_adjustments_fid on tip_balance_adjustments (fid, created_at desc);
