-- supabase/migrations/20260619120000_add_provenance.sql
-- Add explicit provenance columns to events table for Provenance Bridge.

ALTER TABLE events ADD COLUMN IF NOT EXISTS provenance_file TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS provenance_coordinate TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS provenance_hash TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_direct_entry BOOLEAN DEFAULT false;
