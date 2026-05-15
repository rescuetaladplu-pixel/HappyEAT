-- ===== Phase 2: realtime =====
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.orders';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== Phase 3B: promotions =====
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS discount_price numeric;

CREATE TABLE IF NOT EXISTS public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  code text NOT NULL,
  description text,
  type text NOT NULL CHECK (type IN ('percent','fixed')),
  value numeric NOT NULL CHECK (value > 0),
  min_order numeric NOT NULL DEFAULT 0,
  max_discount numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer,
  used_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, code)
);
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage promotions" ON public.promotions FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid()));

CREATE POLICY "Public view active promotions" ON public.promotions FOR SELECT TO anon, authenticated
USING (
  is_active = true AND
  EXISTS (SELECT 1 FROM restaurants r WHERE r.id = restaurant_id AND r.is_approved = true)
);

CREATE TABLE IF NOT EXISTS public.order_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  promotion_id uuid NOT NULL,
  code text NOT NULL,
  discount_amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers add order promotions" ON public.order_promotions FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_id AND o.customer_id = auth.uid()));

CREATE POLICY "View order promotions via order" ON public.order_promotions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM orders o WHERE o.id = order_id AND (
    o.customer_id = auth.uid() OR o.rider_id = auth.uid() OR
    EXISTS (SELECT 1 FROM restaurants r WHERE r.id = o.restaurant_id AND r.owner_id = auth.uid()) OR
    has_role(auth.uid(),'admin'::app_role)
  )
));

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0;

-- ===== Phase 4: reviews =====
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS owner_reply text,
  ADD COLUMN IF NOT EXISTS replied_at timestamptz;

CREATE POLICY "Owner reply to own restaurant reviews" ON public.reviews FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM orders o JOIN restaurants r ON r.id = o.restaurant_id
  WHERE o.id = reviews.order_id AND r.owner_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM orders o JOIN restaurants r ON r.id = o.restaurant_id
  WHERE o.id = reviews.order_id AND r.owner_id = auth.uid()
));

-- Trigger: keep restaurants.rating in sync with avg restaurant_rating
CREATE OR REPLACE FUNCTION public.recalc_restaurant_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _rid uuid; _avg numeric;
BEGIN
  SELECT restaurant_id INTO _rid FROM orders WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  IF _rid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT COALESCE(AVG(rv.restaurant_rating)::numeric(3,2), 0) INTO _avg
  FROM reviews rv JOIN orders o ON o.id = rv.order_id
  WHERE o.restaurant_id = _rid AND rv.restaurant_rating IS NOT NULL;
  UPDATE restaurants SET rating = _avg WHERE id = _rid;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS reviews_recalc_rating ON public.reviews;
CREATE TRIGGER reviews_recalc_rating
AFTER INSERT OR UPDATE OR DELETE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.recalc_restaurant_rating();