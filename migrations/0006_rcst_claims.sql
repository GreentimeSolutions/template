-- Quote-cast for $RCST: one claim per FID (lifetime), per address, per cast hash; daily cap via rcst_days.
create table if not exists rcst_claims (
  id bigserial primary key,
  day date not null,
  fid bigint not null,
  address text not null,
  cast_hash text not null,
  channel text,
  amount integer not null,
  status text not null default 'pending', -- pending | sent | failed
  tx_hash text,
  error text,
  created_at timestamptz not null default now()
);
create unique index if not exists rcst_claims_fid on rcst_claims (fid) where status <> 'failed';
create unique index if not exists rcst_claims_address on rcst_claims (address) where status <> 'failed';
create unique index if not exists rcst_claims_cast on rcst_claims (cast_hash) where status <> 'failed';
create table if not exists rcst_days (
  day date primary key,
  claims integer not null default 0
);
