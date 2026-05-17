-- 1) Create public view without sensitive fields
CREATE OR REPLACE VIEW public.restaurants_public
WITH (security_invoker = true)
AS
SELECT
  id, owner_id, name, description, category, categories,
  image_url, logo_url, cover_url,
  address, latitude, longitude,
  is_open, is_open_until, is_approved,
  rating, delivery_fee, opening_hours,
  created_at, updated_at
FROM public.restaurants;

GRANT SELECT ON public.restaurants_public TO anon, authenticated;

-- 2) Tighten RLS on restaurants: only authenticated (+ owner/admin) see raw table
DROP POLICY IF EXISTS "Public view approved restaurants" ON public.restaurants;

CREATE POLICY "Authenticated view approved restaurants"
ON public.restaurants
FOR SELECT
TO authenticated
USING (
  is_approved = true
  OR auth.uid() = owner_id
  OR has_role(auth.uid(), 'admin'::app_role)
);
