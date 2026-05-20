ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notification_sound text NOT NULL DEFAULT 'siren'
CHECK (notification_sound IN ('siren','airhorn','emergency'));