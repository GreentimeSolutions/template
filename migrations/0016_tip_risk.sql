-- Spam / sybil checks for anonymous tips (Feature A). Additive and inert:
-- nothing here changes behaviour until TIPS_RISK_MODE is set to log or enforce.
alter table anon_tips add column if not exists review_state text not null default 'none';
  -- none | held | approved | rejected | expired
alter table anon_tips add column if not exists risk_flags text[] not null default '{}';
alter table anon_tips add column if not exists reviewed_by text;
alter table anon_tips add column if not exists reviewed_at timestamptz;
-- anon_tips.status gains: held (reserves balance) | approving (send in progress) | rejected | expired

alter table gift_points_ledger add column if not exists state text not null default 'credited';
  -- credited | pending | void
alter table gift_points_ledger add column if not exists release_at timestamptz;

-- Neynar user lookups cached for a day (scores update weekly).
create table if not exists fc_user_cache (
  fid bigint primary key,
  username text,
  score numeric(4,3),
  registered_at timestamptz,
  follower_count integer,
  following_count integer,
  custody_address text,
  eth_addresses text[] not null default '{}',
  primary_eth text,
  fetched_at timestamptz not null default now()
);

-- Append-only decision trail (system holds, admin approvals, shadow-mode flags).
create table if not exists tip_risk_reviews (
  id bigserial primary key,
  tip_id bigint not null references anon_tips(id),
  decision text not null, -- shadow | hold | points_hold | approve | reject | expire | void_points | release_points
  flags text[] not null default '{}',
  actor text not null,    -- 'system' or 'admin:<fid>'
  note text,
  created_at timestamptz not null default now()
);
create index if not exists tip_risk_reviews_tip on tip_risk_reviews (tip_id, created_at);
create index if not exists anon_tips_recipient_created on anon_tips (recipient_fid, created_at desc);
create index if not exists anon_tips_created on anon_tips (created_at desc);
create index if not exists anon_tips_review on anon_tips (review_state) where review_state = 'held';
create index if not exists gift_points_ledger_pending on gift_points_ledger (release_at) where state = 'pending';
