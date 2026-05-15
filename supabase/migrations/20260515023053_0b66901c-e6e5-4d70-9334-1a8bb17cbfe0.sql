
-- Phase 1: Restaurant profile + map + opening hours
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS opening_hours jsonb NOT NULL DEFAULT '{
    "mon":{"open":"09:00","close":"21:00","closed":false},
    "tue":{"open":"09:00","close":"21:00","closed":false},
    "wed":{"open":"09:00","close":"21:00","closed":false},
    "thu":{"open":"09:00","close":"21:00","closed":false},
    "fri":{"open":"09:00","close":"21:00","closed":false},
    "sat":{"open":"09:00","close":"21:00","closed":false},
    "sun":{"open":"09:00","close":"21:00","closed":false}
  }'::jsonb;

-- Menu categories
CREATE TABLE IF NOT EXISTS public.menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public view menu categories"
  ON public.menu_categories FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM restaurants r
    WHERE r.id = menu_categories.restaurant_id
      AND (r.is_approved = true OR r.owner_id = auth.uid())
  ) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Owners manage menu categories"
  ON public.menu_categories FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM restaurants r
    WHERE r.id = menu_categories.restaurant_id AND r.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM restaurants r
    WHERE r.id = menu_categories.restaurant_id AND r.owner_id = auth.uid()
  ));

-- Storage bucket for restaurant images
INSERT INTO storage.buckets (id, name, public)
VALUES ('restaurant-images', 'restaurant-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read restaurant images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'restaurant-images');

CREATE POLICY "Authenticated upload restaurant images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'restaurant-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owners update own restaurant images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'restaurant-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owners delete own restaurant images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'restaurant-images' AND auth.uid()::text = (storage.foldername(name))[1]);
