alter table if exists admark.team_members
  add column if not exists member_type text,
  add column if not exists team_group text;
