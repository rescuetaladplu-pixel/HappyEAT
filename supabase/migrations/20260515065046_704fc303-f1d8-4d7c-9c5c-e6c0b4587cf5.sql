
-- 1. menu_items: add category_id (FK to menu_categories) + sort_order
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON public.menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id ON public.menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_restaurant_id ON public.menu_categories(restaurant_id);

-- 2. menu_addon_groups
CREATE TABLE IF NOT EXISTS public.menu_addon_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  min_select integer NOT NULL DEFAULT 0,
  max_select integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_addon_groups_menu_item ON public.menu_addon_groups(menu_item_id);

ALTER TABLE public.menu_addon_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage addon groups"
  ON public.menu_addon_groups FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.menu_items mi
    JOIN public.restaurants r ON r.id = mi.restaurant_id
    WHERE mi.id = menu_addon_groups.menu_item_id AND r.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.menu_items mi
    JOIN public.restaurants r ON r.id = mi.restaurant_id
    WHERE mi.id = menu_addon_groups.menu_item_id AND r.owner_id = auth.uid()
  ));

CREATE POLICY "Public view addon groups"
  ON public.menu_addon_groups FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.menu_items mi
    JOIN public.restaurants r ON r.id = mi.restaurant_id
    WHERE mi.id = menu_addon_groups.menu_item_id
      AND (r.is_approved = true OR r.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ));

-- 3. menu_addon_options
CREATE TABLE IF NOT EXISTS public.menu_addon_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.menu_addon_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_addon_options_group ON public.menu_addon_options(group_id);

ALTER TABLE public.menu_addon_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage addon options"
  ON public.menu_addon_options FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.menu_addon_groups g
    JOIN public.menu_items mi ON mi.id = g.menu_item_id
    JOIN public.restaurants r ON r.id = mi.restaurant_id
    WHERE g.id = menu_addon_options.group_id AND r.owner_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.menu_addon_groups g
    JOIN public.menu_items mi ON mi.id = g.menu_item_id
    JOIN public.restaurants r ON r.id = mi.restaurant_id
    WHERE g.id = menu_addon_options.group_id AND r.owner_id = auth.uid()
  ));

CREATE POLICY "Public view addon options"
  ON public.menu_addon_options FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.menu_addon_groups g
    JOIN public.menu_items mi ON mi.id = g.menu_item_id
    JOIN public.restaurants r ON r.id = mi.restaurant_id
    WHERE g.id = menu_addon_options.group_id
      AND (r.is_approved = true OR r.owner_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ));
