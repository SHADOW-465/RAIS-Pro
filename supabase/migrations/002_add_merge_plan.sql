-- supabase/migrations/002_add_merge_plan.sql
-- Persist the AI-produced merge plan so the Sources panel loads on saved sessions

alter table sessions
  add column if not exists merge_plan jsonb;
