-- 1) Default status of new orders → awaiting_confirmations
ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'awaiting_confirmations'::order_status;

-- 2) Auto-transition trigger: when both restaurant accepted AND rider claimed → awaiting_payment
CREATE OR REPLACE FUNCTION public.auto_transition_to_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'awaiting_confirmations'
     AND NEW.restaurant_accepted_at IS NOT NULL
     AND NEW.rider_id IS NOT NULL THEN
    NEW.status := 'awaiting_payment'::order_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_transition_to_payment ON public.orders;
CREATE TRIGGER trg_auto_transition_to_payment
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.auto_transition_to_payment();

-- 3) RPC: rider claims an order (race-safe, single transaction)
CREATE OR REPLACE FUNCTION public.rider_claim_order(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _approved boolean;
  _updated uuid;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF NOT public.has_role(_uid, 'rider'::app_role) THEN RETURN false; END IF;

  SELECT is_approved INTO _approved FROM public.riders WHERE id = _uid;
  IF NOT COALESCE(_approved, false) THEN RETURN false; END IF;

  UPDATE public.orders
     SET rider_id = _uid,
         rider_accepted_at = now(),
         updated_at = now()
   WHERE id = _order_id
     AND rider_id IS NULL
     AND status = 'awaiting_confirmations'::order_status
  RETURNING id INTO _updated;

  RETURN _updated IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.rider_claim_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rider_claim_order(uuid) TO authenticated;

-- 4) RPC: rider releases an order BEFORE customer paid (rider changed mind)
CREATE OR REPLACE FUNCTION public.rider_release_order(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _updated uuid;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;

  UPDATE public.orders
     SET rider_id = NULL,
         rider_accepted_at = NULL,
         updated_at = now()
   WHERE id = _order_id
     AND rider_id = _uid
     AND status IN ('awaiting_confirmations'::order_status, 'awaiting_payment'::order_status)
  RETURNING id INTO _updated;

  RETURN _updated IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.rider_release_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rider_release_order(uuid) TO authenticated;

-- 5) RPC: restaurant accepts order (sets restaurant_accepted_at; trigger may auto-transition)
CREATE OR REPLACE FUNCTION public.restaurant_accept_order(_order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_owner boolean;
  _updated uuid;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.restaurants r ON r.id = o.restaurant_id
    WHERE o.id = _order_id AND r.owner_id = _uid
  ) INTO _is_owner;
  IF NOT _is_owner THEN RETURN false; END IF;

  UPDATE public.orders
     SET restaurant_accepted_at = now(),
         updated_at = now()
   WHERE id = _order_id
     AND status = 'awaiting_confirmations'::order_status
     AND restaurant_accepted_at IS NULL
  RETURNING id INTO _updated;

  RETURN _updated IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.restaurant_accept_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restaurant_accept_order(uuid) TO authenticated;

-- 6) Expand SELECT policy: riders can see pool orders at awaiting_confirmations too
DROP POLICY IF EXISTS "Customers view own orders" ON public.orders;
CREATE POLICY "Customers view own orders" ON public.orders
FOR SELECT
TO authenticated
USING (
  (auth.uid() = customer_id)
  OR (auth.uid() = rider_id)
  OR (EXISTS (SELECT 1 FROM restaurants r WHERE r.id = orders.restaurant_id AND r.owner_id = auth.uid()))
  OR (
    public.has_role(auth.uid(), 'rider'::app_role)
    AND rider_id IS NULL
    AND status IN (
      'awaiting_confirmations'::order_status,
      'ready'::order_status,
      'preparing'::order_status
    )
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 7) Update enforce_orders_update_authorization to support new transitions
CREATE OR REPLACE FUNCTION public.enforce_orders_update_authorization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_owner boolean;
  _is_admin boolean;
  _is_assigned_rider boolean;
  _is_open_rider_claim boolean;
BEGIN
  _is_admin := public.has_role(_uid, 'admin'::app_role);
  IF _is_admin THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM restaurants r WHERE r.id = NEW.restaurant_id AND r.owner_id = _uid
  ) INTO _is_owner;
  IF _is_owner THEN RETURN NEW; END IF;

  _is_assigned_rider := (OLD.rider_id IS NOT NULL AND OLD.rider_id = _uid);
  IF _is_assigned_rider THEN RETURN NEW; END IF;

  -- Legacy direct rider claim path (kept for backward compat with ready/preparing pool)
  _is_open_rider_claim := (
    OLD.rider_id IS NULL
    AND NEW.rider_id = _uid
    AND public.has_role(_uid, 'rider'::app_role)
    AND OLD.status IN ('ready'::order_status, 'preparing'::order_status)
    AND NEW.status = 'picked_up'::order_status
  );
  IF _is_open_rider_claim THEN RETURN NEW; END IF;

  -- From here on, treat caller as the customer.
  IF _uid IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'orders update not authorized';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
     OR NEW.rider_id IS DISTINCT FROM OLD.rider_id
     OR NEW.rider_accepted_at IS DISTINCT FROM OLD.rider_accepted_at
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
     OR NEW.discount IS DISTINCT FROM OLD.discount
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
     OR NEW.payment_confirmed_at IS DISTINCT FROM OLD.payment_confirmed_at
     OR NEW.restaurant_accepted_at IS DISTINCT FROM OLD.restaurant_accepted_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.delivery_otp IS DISTINCT FROM OLD.delivery_otp
     OR NEW.delivery_address IS DISTINCT FROM OLD.delivery_address
     OR NEW.delivery_lat IS DISTINCT FROM OLD.delivery_lat
     OR NEW.delivery_lng IS DISTINCT FROM OLD.delivery_lng
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'customers may only modify notes, payment_slip_url, payment_submitted_at, and limited status transitions';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'awaiting_payment'::order_status AND NEW.status = 'awaiting_payment_confirm'::order_status)
      OR (OLD.status IN (
            'awaiting_confirmations'::order_status,
            'awaiting_restaurant'::order_status,
            'awaiting_payment'::order_status,
            'awaiting_payment_confirm'::order_status,
            'payment_rejected'::order_status
          ) AND NEW.status = 'cancelled'::order_status)
    ) THEN
      RAISE EXCEPTION 'customer not allowed to change status from % to %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;