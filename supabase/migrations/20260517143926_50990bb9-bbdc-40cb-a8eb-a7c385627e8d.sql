-- 1) RPC for OTP-verified delivery completion
CREATE OR REPLACE FUNCTION public.confirm_delivery(order_id uuid, otp_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stored_otp text;
  order_rider_id uuid;
  order_status_val order_status;
BEGIN
  SELECT delivery_otp, rider_id, status
    INTO stored_otp, order_rider_id, order_status_val
  FROM public.orders WHERE id = order_id;

  IF order_rider_id IS NULL OR order_rider_id <> auth.uid() THEN
    RETURN false;
  END IF;

  IF stored_otp IS NULL OR stored_otp <> otp_code THEN
    RETURN false;
  END IF;

  UPDATE public.orders
     SET status = 'delivered', updated_at = now()
   WHERE id = order_id
     AND rider_id = auth.uid()
     AND status IN ('picked_up','delivering');

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_delivery(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_delivery(uuid, text) TO authenticated;

-- 2) Tighten orders UPDATE policy: rider cannot set status='delivered' directly
DROP POLICY IF EXISTS "Restaurant/rider/customer update orders" ON public.orders;

CREATE POLICY "Restaurant/rider/customer update orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  auth.uid() = customer_id
  OR auth.uid() = rider_id
  OR EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = orders.restaurant_id AND r.owner_id = auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'rider'::app_role) AND rider_id IS NULL)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR auth.uid() = customer_id
  OR EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = orders.restaurant_id AND r.owner_id = auth.uid())
  -- rider claiming an unassigned order
  OR (has_role(auth.uid(), 'rider'::app_role) AND rider_id = auth.uid() AND status IN ('picked_up'))
  -- rider progressing their own order, but NEVER to 'delivered' (must use confirm_delivery RPC)
  OR (auth.uid() = rider_id AND status IN ('picked_up','delivering'))
);