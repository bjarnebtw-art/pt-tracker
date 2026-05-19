-- Training log: advised load + block snapshot + stable ordering
ALTER TABLE session_exercises ADD COLUMN IF NOT EXISTS advised_weight double precision;
ALTER TABLE session_exercises ADD COLUMN IF NOT EXISTS block text;
ALTER TABLE session_exercises ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
