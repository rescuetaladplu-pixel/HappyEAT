CREATE TABLE public.variant_group_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, name)
);

CREATE TABLE public.variant_group_template_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.variant_group_templates(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.variant_group_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variant_group_template_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage variant templates"
ON public.variant_group_templates FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = variant_group_templates.restaurant_id AND r.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = variant_group_templates.restaurant_id AND r.owner_id = auth.uid()));

CREATE POLICY "Owners manage variant template options"
ON public.variant_group_template_options FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.variant_group_templates t JOIN public.restaurants r ON r.id = t.restaurant_id WHERE t.id = variant_group_template_options.template_id AND r.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.variant_group_templates t JOIN public.restaurants r ON r.id = t.restaurant_id WHERE t.id = variant_group_template_options.template_id AND r.owner_id = auth.uid()));