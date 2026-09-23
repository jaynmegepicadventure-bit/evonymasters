-- Run in Supabase SQL Editor. All numeric game facts remain NULL until verified.
create table if not exists items (
  id text primary key, name text not null unique, category text not null,
  created_at timestamptz not null default now()
);
create table if not exists events (
  id text primary key, name text not null unique, starts_at timestamptz, ends_at timestamptz,
  constraint valid_event_dates check (ends_at is null or starts_at is null or ends_at >= starts_at)
);
create table if not exists monsters (
  id text primary key, name text not null, monster_type text not null check (monster_type in ('Regular','Boss','Event')),
  level integer check (level is null or level >= 0),
  power bigint check (power is null or power >= 0),
  stamina_cost integer check (stamina_cost is null or stamina_cost >= 0),
  image_path text, event_id text references events(id) on delete set null,
  source_url text, verified_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists monsters_name_idx on monsters (lower(name));
create index if not exists monsters_type_idx on monsters (monster_type);
create table if not exists monster_rewards (
  id bigint generated always as identity primary key,
  monster_id text not null references monsters(id) on delete cascade,
  item_id text not null references items(id) on delete restrict,
  reward_kind text not null check (reward_kind in ('guaranteed','possible')),
  quantity numeric(18,3) check (quantity is null or quantity >= 0),
  unit text, drop_rate numeric(6,5) check (drop_rate is null or (drop_rate >= 0 and drop_rate <= 1)),
  notes text, source_url text, verified_at timestamptz,
  unique (monster_id,item_id,reward_kind,notes)
);
create index if not exists rewards_item_idx on monster_rewards(item_id);
create index if not exists rewards_monster_idx on monster_rewards(monster_id);
-- Data is published via a reviewed static export, not direct browser DB access.
-- No anonymous table policies are created; keep RLS enabled.
alter table items enable row level security;
alter table events enable row level security;
alter table monsters enable row level security;
alter table monster_rewards enable row level security;
