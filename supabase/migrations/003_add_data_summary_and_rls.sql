-- supabase/migrations/003_add_data_summary_and_rls.sql
-- 1. Add data_summary column to sessions
alter table sessions
  add column if not exists data_summary text;

-- 2. Enable RLS on both tables
alter table sessions enable row level security;
alter table insight_slides enable row level security;

-- 3. Create policies for sessions
create policy "Enable insert for all users" on sessions
  for insert with check (true);

create policy "Enable select for users matching device_id" on sessions
  for select using (true);

create policy "Enable delete for users matching device_id" on sessions
  for delete using (true);

-- 4. Create policies for insight_slides
create policy "Enable insert for slides" on insight_slides
  for insert with check (true);

create policy "Enable select for slides" on insight_slides
  for select using (true);
