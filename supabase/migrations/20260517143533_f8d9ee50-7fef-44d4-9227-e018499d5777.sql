DROP POLICY IF EXISTS "Riders insert own" ON public.riders;
CREATE POLICY "Riders insert own"
ON public.riders FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = id
  AND is_approved = false
  AND is_online = false
);

DROP POLICY IF EXISTS "Riders update own" ON public.riders;
CREATE POLICY "Riders update own"
ON public.riders FOR UPDATE
TO authenticated
USING (auth.uid() = id OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (
    auth.uid() = id
    AND is_approved = (SELECT r.is_approved FROM public.riders r WHERE r.id = auth.uid())
  )
);