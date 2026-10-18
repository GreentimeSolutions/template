-- Listen-for-the-boost: server-tracked listen sessions (additive only).
create table if not exists listen_sessions (
  id text primary key,                 -- random UUID handed to the client
  day date not null,                   -- UTC day the session started
  identity text not null,              -- 'fid:<fid>' or 'web:<address>:<ip_hash>'
  source text not null default 'local',-- local | soundcloud | ...
  status text not null default 'started', -- started | completed | abandoned
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  played_seconds real,
  claim_id bigint,                     -- faucet_claims.id that used this listen
  created_at timestamptz not null default now()
);
-- One active session per identity at a time.
create unique index if not exists listen_sessions_one_active on listen_sessions (identity) where status = 'started';
create index if not exists listen_sessions_identity_day on listen_sessions (identity, day);
alter table faucet_claims add column if not exists listen_bonus boolean not null default false;
