-- Tamper-evident ledger for tips, gift points, balance credits and review decisions (Feature B).
--
-- Every insert (and every status/state change) on the source tables appends one
-- hash-chained row to ledger_events from a database trigger, inside the same
-- transaction as the source write. Ledger tables are append-only.
--
-- Inert until enabled: triggers check app_settings.ledger_on, which defaults to '0'.
-- `select ledger_enable()` backfills existing rows (genesis first) and turns it on;
-- scripts/migrate.mjs calls it at deploy time only when LEDGER_ON=1.
--
-- hash = sha256(utf8(seq || '\n' || event_type || '\n' || payload || '\n' || hex(prev_hash)))
-- genesis prev_hash = 32 zero bytes. payload is stored as the exact hashed text.
-- Sender fids are never in a payload: sender_commit = sha256(hex(salt) || ':' || fid),
-- with a random per-event salt kept in the private ledger_salts table.

create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
insert into app_settings (key, value) values ('ledger_on', '0') on conflict (key) do nothing;

create table if not exists ledger_events (
  seq bigint primary key,
  event_type text not null,
  ref_table text,
  ref_id bigint,
  payload text not null,
  created_at timestamptz not null default now(),
  prev_hash bytea not null,
  hash bytea not null unique,
  constraint ledger_prev_unique unique (prev_hash),
  constraint ledger_seq_nonneg check (seq >= 0)
);
create index if not exists ledger_events_ref on ledger_events (ref_table, ref_id);

create table if not exists ledger_salts (
  seq bigint primary key references ledger_events(seq),
  salt bytea not null
);

create table if not exists ledger_anchors (
  id bigserial primary key,
  head_seq bigint not null,
  head_hash bytea not null,
  chain_id integer not null default 8453,
  tx_hash text,
  cast_hash text,
  created_at timestamptz not null default now()
);

create or replace function ledger_is_on() returns boolean language sql stable as $$
  select coalesce((select value = '1' from app_settings where key = 'ledger_on'), false)
$$;

create or replace function ledger_ts(t timestamptz) returns text language sql stable as $$
  select case when t is null then null
    else to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end
$$;

create or replace function ledger_hash(p_seq bigint, p_type text, p_payload text, p_prev bytea)
returns bytea language sql stable as $$
  select sha256(convert_to(p_seq::text || E'\n' || p_type || E'\n' || p_payload || E'\n' || encode(p_prev, 'hex'), 'UTF8'))
$$;

create or replace function ledger_new_salt() returns bytea language sql volatile as $$
  select decode(replace(gen_random_uuid()::text, '-', ''), 'hex')
$$;

create or replace function ledger_commit(p_salt bytea, p_value text) returns text language sql stable as $$
  select encode(sha256(convert_to(encode(p_salt, 'hex') || ':' || coalesce(p_value, ''), 'UTF8')), 'hex')
$$;

create or replace function ledger_append(p_type text, p_table text, p_id bigint, p_payload text, p_salt bytea default null)
returns bigint language plpgsql as $$
declare
  h record;
  v_seq bigint;
  v_prev bytea;
begin
  perform pg_advisory_xact_lock(7710010);
  select seq, hash into h from ledger_events order by seq desc limit 1;
  v_seq := coalesce(h.seq + 1, 0);
  v_prev := coalesce(h.hash, decode(repeat('00', 32), 'hex'));
  insert into ledger_events (seq, event_type, ref_table, ref_id, payload, prev_hash, hash)
  values (v_seq, p_type, p_table, p_id, p_payload, v_prev, ledger_hash(v_seq, p_type, p_payload, v_prev));
  if p_salt is not null then
    insert into ledger_salts (seq, salt) values (v_seq, p_salt);
  end if;
  return v_seq;
end $$;

-- Canonical payloads (fixed key order; json text, not jsonb).
create or replace function ledger_tip_created_payload(t anon_tips, p_salt bytea) returns text language sql stable as $$
  select json_build_object(
    'id', t.id,
    'sender_commit', ledger_commit(p_salt, t.sender_fid::text),
    'recipient_fid', t.recipient_fid,
    'recipient_username', t.recipient_username,
    'recipient_address', lower(t.recipient_address),
    'amount', t.amount,
    'gift_points', t.gift_points,
    'status', t.status,
    'review_state', t.review_state,
    'tx_hash', lower(t.tx_hash),
    'cast_hash', t.cast_hash,
    'created_at', ledger_ts(t.created_at)
  )::text
$$;

create or replace function ledger_tip_status_payload(t anon_tips) returns text language sql stable as $$
  select json_build_object(
    'id', t.id,
    'status', t.status,
    'review_state', t.review_state,
    'risk_flags', t.risk_flags,
    'tx_hash', lower(t.tx_hash),
    'cast_hash', t.cast_hash,
    'reviewed_at', ledger_ts(t.reviewed_at)
  )::text
$$;

create or replace function ledger_points_created_payload(p gift_points_ledger, p_salt bytea) returns text language sql stable as $$
  select json_build_object(
    'id', p.id,
    'tip_id', p.tip_id,
    'fid_commit', ledger_commit(p_salt, p.fid::text),
    'points', p.points,
    'amount', p.amount,
    'note', p.note,
    'state', p.state,
    'release_at', ledger_ts(p.release_at),
    'created_at', ledger_ts(p.created_at)
  )::text
$$;

create or replace function ledger_points_state_payload(p gift_points_ledger) returns text language sql stable as $$
  select json_build_object('id', p.id, 'tip_id', p.tip_id, 'state', p.state, 'release_at', ledger_ts(p.release_at))::text
$$;

create or replace function ledger_adjust_payload(a tip_balance_adjustments, p_salt bytea) returns text language sql stable as $$
  select json_build_object(
    'id', a.id,
    'fid_commit', ledger_commit(p_salt, a.fid::text),
    'amount', a.amount,
    'note_commit', ledger_commit(p_salt, a.note),
    'created_at', ledger_ts(a.created_at)
  )::text
$$;

create or replace function ledger_review_payload(r tip_risk_reviews, p_salt bytea) returns text language sql stable as $$
  select json_build_object(
    'id', r.id,
    'tip_id', r.tip_id,
    'decision', r.decision,
    'flags', r.flags,
    'actor', r.actor,
    'note_commit', case when r.note is null then null else ledger_commit(p_salt, r.note) end,
    'created_at', ledger_ts(r.created_at)
  )::text
$$;

-- Source-table triggers.
create or replace function ledger_on_anon_tips() returns trigger language plpgsql as $$
declare s bytea;
begin
  if not ledger_is_on() then return null; end if;
  if tg_op = 'INSERT' then
    s := ledger_new_salt();
    perform ledger_append('tip.created', 'anon_tips', new.id, ledger_tip_created_payload(new, s), s);
  elsif (new.status, new.review_state, new.risk_flags, new.tx_hash, new.cast_hash)
        is distinct from (old.status, old.review_state, old.risk_flags, old.tx_hash, old.cast_hash) then
    perform ledger_append('tip.status', 'anon_tips', new.id, ledger_tip_status_payload(new), null);
  end if;
  return null;
end $$;

create or replace function ledger_guard_anon_tips() returns trigger language plpgsql as $$
begin
  if not ledger_is_on() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then raise exception 'anon_tips rows are permanent while the ledger is on'; end if;
  if (new.id, new.sender_fid, new.recipient_fid, new.recipient_username, new.recipient_address, new.amount, new.gift_points, new.created_at)
     is distinct from (old.id, old.sender_fid, old.recipient_fid, old.recipient_username, old.recipient_address, old.amount, old.gift_points, old.created_at) then
    raise exception 'anon_tips: only status/review fields may change while the ledger is on';
  end if;
  return new;
end $$;

create or replace function ledger_on_points() returns trigger language plpgsql as $$
declare s bytea;
begin
  if not ledger_is_on() then return null; end if;
  if tg_op = 'INSERT' then
    s := ledger_new_salt();
    perform ledger_append('points.created', 'gift_points_ledger', new.id, ledger_points_created_payload(new, s), s);
  elsif (new.state, new.release_at) is distinct from (old.state, old.release_at) then
    perform ledger_append('points.state', 'gift_points_ledger', new.id, ledger_points_state_payload(new), null);
  end if;
  return null;
end $$;

create or replace function ledger_guard_points() returns trigger language plpgsql as $$
begin
  if not ledger_is_on() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then raise exception 'gift_points_ledger rows are permanent while the ledger is on'; end if;
  if (new.id, new.fid, new.tip_id, new.points, new.amount, new.note, new.created_at)
     is distinct from (old.id, old.fid, old.tip_id, old.points, old.amount, old.note, old.created_at) then
    raise exception 'gift_points_ledger: only state/release_at may change while the ledger is on';
  end if;
  return new;
end $$;

create or replace function ledger_on_adjust() returns trigger language plpgsql as $$
declare s bytea;
begin
  if not ledger_is_on() then return null; end if;
  s := ledger_new_salt();
  perform ledger_append('balance.adjust', 'tip_balance_adjustments', new.id, ledger_adjust_payload(new, s), s);
  return null;
end $$;

create or replace function ledger_on_review() returns trigger language plpgsql as $$
declare s bytea;
begin
  if not ledger_is_on() then return null; end if;
  s := ledger_new_salt();
  perform ledger_append('review.decision', 'tip_risk_reviews', new.id, ledger_review_payload(new, s), s);
  return null;
end $$;

-- Rows that are append-only while the ledger is on (corrections are new rows).
create or replace function ledger_guard_append_only() returns trigger language plpgsql as $$
begin
  if not ledger_is_on() then
    if tg_op = 'DELETE' then return old; end if;
    if tg_op = 'TRUNCATE' then return null; end if;
    return new;
  end if;
  raise exception '% is append-only while the ledger is on', tg_table_name;
end $$;

-- The ledger itself is always append-only.
create or replace function ledger_immutable() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;

drop trigger if exists ledger_log on anon_tips;
create trigger ledger_log after insert or update on anon_tips for each row execute function ledger_on_anon_tips();
drop trigger if exists ledger_guard on anon_tips;
create trigger ledger_guard before update or delete on anon_tips for each row execute function ledger_guard_anon_tips();
drop trigger if exists ledger_guard_truncate on anon_tips;
create trigger ledger_guard_truncate before truncate on anon_tips execute function ledger_guard_append_only();

drop trigger if exists ledger_log on gift_points_ledger;
create trigger ledger_log after insert or update on gift_points_ledger for each row execute function ledger_on_points();
drop trigger if exists ledger_guard on gift_points_ledger;
create trigger ledger_guard before update or delete on gift_points_ledger for each row execute function ledger_guard_points();
drop trigger if exists ledger_guard_truncate on gift_points_ledger;
create trigger ledger_guard_truncate before truncate on gift_points_ledger execute function ledger_guard_append_only();

drop trigger if exists ledger_log on tip_balance_adjustments;
create trigger ledger_log after insert on tip_balance_adjustments for each row execute function ledger_on_adjust();
drop trigger if exists ledger_guard on tip_balance_adjustments;
create trigger ledger_guard before update or delete on tip_balance_adjustments for each row execute function ledger_guard_append_only();
drop trigger if exists ledger_guard_truncate on tip_balance_adjustments;
create trigger ledger_guard_truncate before truncate on tip_balance_adjustments execute function ledger_guard_append_only();

drop trigger if exists ledger_log on tip_risk_reviews;
create trigger ledger_log after insert on tip_risk_reviews for each row execute function ledger_on_review();
drop trigger if exists ledger_guard on tip_risk_reviews;
create trigger ledger_guard before update or delete on tip_risk_reviews for each row execute function ledger_guard_append_only();
drop trigger if exists ledger_guard_truncate on tip_risk_reviews;
create trigger ledger_guard_truncate before truncate on tip_risk_reviews execute function ledger_guard_append_only();

drop trigger if exists ledger_no_update on ledger_events;
create trigger ledger_no_update before update or delete on ledger_events for each row execute function ledger_immutable();
drop trigger if exists ledger_no_truncate on ledger_events;
create trigger ledger_no_truncate before truncate on ledger_events execute function ledger_immutable();
drop trigger if exists ledger_no_update on ledger_salts;
create trigger ledger_no_update before update or delete on ledger_salts for each row execute function ledger_immutable();
drop trigger if exists ledger_no_truncate on ledger_salts;
create trigger ledger_no_truncate before truncate on ledger_salts execute function ledger_immutable();
drop trigger if exists ledger_no_update on ledger_anchors;
create trigger ledger_no_update before update or delete on ledger_anchors for each row execute function ledger_immutable();

-- Backfill every source row that has no creation event yet (genesis first), then turn on.
-- Idempotent: a second call appends nothing and returns the current head seq.
create or replace function ledger_enable() returns bigint language plpgsql as $$
declare
  r record;
  s bytea;
  v_head bigint;
begin
  perform pg_advisory_xact_lock(7710010);
  if not exists (select 1 from ledger_events) then
    perform ledger_append('genesis', null, null,
      json_build_object('app', 'youcognito', 'v', 1, 'note', 'chain start; earlier rows backfilled')::text, null);
  end if;
  for r in
    select * from (
      select 'anon_tips'::text as tbl, t.id, t.created_at, 1 as ord from anon_tips t
        where not exists (select 1 from ledger_events e where e.ref_table = 'anon_tips' and e.ref_id = t.id and e.event_type = 'tip.created')
      union all
      select 'gift_points_ledger', p.id, p.created_at, 2 from gift_points_ledger p
        where not exists (select 1 from ledger_events e where e.ref_table = 'gift_points_ledger' and e.ref_id = p.id and e.event_type = 'points.created')
      union all
      select 'tip_balance_adjustments', a.id, a.created_at, 3 from tip_balance_adjustments a
        where not exists (select 1 from ledger_events e where e.ref_table = 'tip_balance_adjustments' and e.ref_id = a.id)
      union all
      select 'tip_risk_reviews', v.id, v.created_at, 4 from tip_risk_reviews v
        where not exists (select 1 from ledger_events e where e.ref_table = 'tip_risk_reviews' and e.ref_id = v.id)
    ) x order by created_at, ord, id
  loop
    s := ledger_new_salt();
    if r.tbl = 'anon_tips' then
      perform ledger_append('tip.created', 'anon_tips', r.id, (select ledger_tip_created_payload(t, s) from anon_tips t where t.id = r.id), s);
    elsif r.tbl = 'gift_points_ledger' then
      perform ledger_append('points.created', 'gift_points_ledger', r.id, (select ledger_points_created_payload(p, s) from gift_points_ledger p where p.id = r.id), s);
    elsif r.tbl = 'tip_balance_adjustments' then
      perform ledger_append('balance.adjust', 'tip_balance_adjustments', r.id, (select ledger_adjust_payload(a, s) from tip_balance_adjustments a where a.id = r.id), s);
    else
      perform ledger_append('review.decision', 'tip_risk_reviews', r.id, (select ledger_review_payload(v, s) from tip_risk_reviews v where v.id = r.id), s);
    end if;
  end loop;
  insert into app_settings (key, value, updated_at) values ('ledger_on', '1', now())
    on conflict (key) do update set value = '1', updated_at = now();
  select max(seq) into v_head from ledger_events;
  return v_head;
end $$;

create or replace function ledger_disable() returns void language sql as $$
  insert into app_settings (key, value, updated_at) values ('ledger_on', '0', now())
    on conflict (key) do update set value = '0', updated_at = now();
$$;
