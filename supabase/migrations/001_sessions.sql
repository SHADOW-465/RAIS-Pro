-- supabase/migrations/001_sessions.sql

-- Sessions: one per file-batch analysis
create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  device_id   text not null,
  title       text not null,
  files       jsonb not null default '[]',
  dashboard   jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists sessions_device_id_idx on sessions (device_id, created_at desc);

-- Insight slides: children of a session, one per follow-up question
create table if not exists insight_slides (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions(id) on delete cascade,
  device_id   text not null,
  question    text not null,
  slide       jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists slides_session_id_idx on insight_slides (session_id, created_at asc);
