-- Add this migration after 001_schema.sql. Record actual item rewards, not standard boss chest entries.
-- 'boss_chest' indicates the item comes from opening the standard boss chest.
-- 'direct' indicates a drop received from defeating the monster.
-- 'other_chest' covers event or special chests, with notes identifying the chest.
alter table monster_rewards
  add column if not exists reward_origin text not null default 'direct'
    check (reward_origin in ('direct','boss_chest','other_chest'));

-- An item from a guaranteed boss chest is NOT automatically guaranteed.
-- Set reward_kind='guaranteed' only if the actual item is guaranteed inside that chest.
-- Keep unknown quantities and drop rates NULL; source_url and verified_at belong to the item claim.
create index if not exists monster_rewards_origin_idx on monster_rewards (reward_origin);
