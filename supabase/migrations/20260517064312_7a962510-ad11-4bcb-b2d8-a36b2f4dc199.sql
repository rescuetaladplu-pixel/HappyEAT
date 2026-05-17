ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS restaurants_categories_idx ON public.restaurants USING GIN(categories);
-- backfill: if there's an existing single category, seed it into the array
UPDATE public.restaurants SET categories = ARRAY[category] WHERE category IS NOT NULL AND category <> '' AND (categories IS NULL OR cardinality(categories) = 0);