-- In-app feedback survey with a one-time YOUCOG reward (additive only).
-- One reward per Farcaster ID and per wallet (lifetime); web submissions are
-- also limited to one per connection (hashed IP). Failed payouts free the slot
-- so the person can retry; pending/sent rows hold it.
create table if not exists feedback_responses (
  id bigserial primary key,
  fid bigint,                          -- verified Farcaster FID (Mini App), null on the web
  address text not null,               -- checksummed payout address
  ip_hash text,                        -- hashed IP for web submissions (null for FID)
  answers jsonb not null,              -- { q1..q10, comment } validated server-side
  amount integer not null,             -- YOUCOG paid (FEEDBACK_REWARD_YOUCOG at submit time)
  status text not null default 'pending', -- pending | sent | failed
  tx_hash text,
  error text,
  created_at timestamptz not null default now()
);
create unique index if not exists feedback_responses_fid on feedback_responses (fid) where status <> 'failed' and fid is not null;
create unique index if not exists feedback_responses_address on feedback_responses (lower(address)) where status <> 'failed';
create unique index if not exists feedback_responses_ip on feedback_responses (ip_hash) where status <> 'failed' and fid is null and ip_hash is not null;
create index if not exists feedback_responses_created on feedback_responses (created_at desc);

-- Global daily cap on rewarded surveys.
create table if not exists feedback_days (
  day date primary key,
  rewards integer not null default 0
);
