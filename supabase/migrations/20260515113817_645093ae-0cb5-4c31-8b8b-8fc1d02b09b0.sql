
CREATE TABLE public.addon_group_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  min_select integer NOT NULL DEFAULT 0,
  max_select integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, name)
);

CREATE TABLE public.addon_group_template_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.addon_group_templates(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.addon_group_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addon_group_template_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage addon templates"
ON public.addon_group_templates
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = addon_group_templates.restaurant_id AND r.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = addon_group_templates.restaurant_id AND r.owner_id = auth.uid()));

CREATE POLICY "Owners manage addon template options"
ON public.addon_group_template_options
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM addon_group_templates t
  JOIN restaurants r ON r.id = t.restaurant_id
  WHERE t.id = addon_group_template_options.template_id AND r.owner_id = auth.uid()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM addon_group_templates t
  JOIN restaurants r ON r.id = t.restaurant_id
  WHERE t.id = addon_group_template_options.template_id AND r.owner_id = auth.uid()
));
