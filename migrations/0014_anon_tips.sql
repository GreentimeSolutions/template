-- Anonymous YOUCOG tips funded from the sender's earned faucet claims.
-- The app wallet pays the recipient; /recast announces the tip without naming the sender.
create table if not exists anon_tips (
  id bigserial primary key,
  sender_fid bigint not null,
  recipient_fid bigint not null,
  recipient_username text not null,
  recipient_address text not null,
  amount integer not null,
  gift_points integer not null,
  status text not null, -- sent | dry_run | failed
  tx_hash text,
  cast_hash text,
  created_at timestamptz not null default now()
);
create index if not exists anon_tips_sender_created on anon_tips (sender_fid, created_at desc);
create index if not exists anon_tips_sender_status on anon_tips (sender_fid, created_at) where status in ('sent', 'dry_run');

-- Recipients who asked not to receive anonymous tips.
create table if not exists tip_opt_outs (
  fid bigint primary key,
  created_at timestamptz not null default now()
);

-- Running gift point totals for tip senders. Rewards, if any, are announced separately.
create table if not exists gift_points (
  fid bigint primary key,
  points integer not null default 0,
  tipped_amount integer not null default 0,
  tip_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists gift_points_ledger (
  id bigserial primary key,
  fid bigint not null,
  tip_id bigint references anon_tips(id),
  points integer not null,
  amount integer not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists gift_points_ledger_fid on gift_points_ledger (fid, created_at desc);
