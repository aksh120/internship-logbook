-- ═══════════════════════════════════════════════
-- Internship Logbook 2026 — Supabase Schema
-- Run this in the Supabase SQL Editor
-- ═══════════════════════════════════════════════

-- Table: day entries (one row per date)
CREATE TABLE IF NOT EXISTS day_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table: tasks (many per day)
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  day_date DATE NOT NULL REFERENCES day_entries(date) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '09:00',
  remark TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_tasks_day_date ON tasks(day_date);

-- Enable Row Level Security
ALTER TABLE day_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Allow public (anon) full access — single-user app
CREATE POLICY "Allow all on day_entries" ON day_entries
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all on tasks" ON tasks
  FOR ALL USING (true) WITH CHECK (true);
