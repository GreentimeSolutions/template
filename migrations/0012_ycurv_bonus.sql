-- YCURV holder bonus: extra YOUCOG included in faucet_claims.amount for YCURV holders, for audit.
alter table faucet_claims add column if not exists ycurv_bonus integer not null default 0;
