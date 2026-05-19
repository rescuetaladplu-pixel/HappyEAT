CREATE POLICY "Anon view approved restaurants"
  ON public.restaurants FOR SELECT
  TO anon
  USING (is_approved = true);