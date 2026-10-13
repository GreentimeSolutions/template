-- Farcaster Mini App claims: one claim per FID per UTC day (failed claims free the slot).
alter table faucet_claims add column if not exists fid bigint;
create unique index if not exists faucet_claims_fid_day on faucet_claims (fid, day) where status <> 'failed' and fid is not null;
