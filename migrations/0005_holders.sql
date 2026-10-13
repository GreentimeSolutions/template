-- Verified YOUCOG holders (ownership proven by Farcaster verification or a signed message).
create table if not exists holders (
  address text primary key,
  fid bigint,
  balance numeric not null,
  is_holder boolean not null,
  method text not null, -- fid | signature
  verified_at timestamptz not null default now()
);
create index if not exists holders_fid on holders (fid);
