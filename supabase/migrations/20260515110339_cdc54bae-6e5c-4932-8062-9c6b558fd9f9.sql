ALTER TABLE public.menu_addon_groups
ADD COLUMN pricing_mode text NOT NULL DEFAULT 'addon'
CHECK (pricing_mode IN ('addon','variant'));