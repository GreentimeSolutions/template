-- Ghost Shop: cosmetics bought with real YOUCOG (ERC-20 transfer to the faucet on Base).
-- One row per verified tx; tx_hash is unique so a transfer can never be redeemed twice.
create table if not exists cosmetic_purchases (
  tx_hash text primary key,
  address text not null,
  item_id text not null,
  amount_wei numeric not null,
  block_number bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists cosmetic_purchases_address_idx on cosmetic_purchases (address);
