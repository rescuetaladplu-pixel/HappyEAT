CREATE POLICY "Users self-assign restaurant or rider role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND role IN ('restaurant'::app_role, 'rider'::app_role)
);