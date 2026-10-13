-- YOUCOG faucet: one claim per address and per IP per UTC day, plus a global daily cap.
create table if not exists faucet_claims (
  id bigserial primary key,
  day date not null,
  address text not null,
  ip_hash text not null,
  amount integer not null,
  status text not null default 'pending', -- pending | sent | failed
  tx_hash text,
  error text,
  created_at timestamptz not null default now()
);
-- Failed claims free the slot so a user can retry; pending/sent claims hold it.
create unique index if not exists faucet_claims_address_day on faucet_claims (address, day) where status <> 'failed';
create unique index if not exists faucet_claims_ip_day on faucet_claims (ip_hash, day) where status <> 'failed';

create table if not exists faucet_days (
  day date primary key,
  claims integer not null default 0
);
