-- Progressive sets: one row per set
ALTER TABLE session_exercises ADD COLUMN IF NOT EXISTS set_number integer DEFAULT 1;
ALTER TABLE session_exercises ADD COLUMN IF NOT EXISTS sets integer DEFAULT 3;
