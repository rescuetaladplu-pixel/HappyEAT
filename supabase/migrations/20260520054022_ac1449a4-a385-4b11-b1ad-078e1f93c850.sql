
-- 1) Schema additions
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_distance_km numeric,
  ADD COLUMN IF NOT EXISTS dispatch_wave smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_dispatched_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS delivery_fee_boost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS awaiting_rider_boost boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_dispatch_pending
  ON public.orders (status, last_dispatched_at)
  WHERE rider_id IS NULL AND dispatch_wave < 4;

-- 2) Loosen customer-update trigger to allow boosting delivery fee
CREATE OR REPLACE FUNCTION public.enforce_orders_update_authorization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _is_owner boolean;
  _is_admin boolean;
  _is_assigned_rider boolean;
  _is_open_rider_claim boolean;
  _boost_delta numeric;
BEGIN
  _is_admin := public.has_role(_uid, 'admin'::app_role);
  IF _is_admin THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM restaurants r WHERE r.id = NEW.restaurant_id AND r.owner_id = _uid
  ) INTO _is_owner;
  IF _is_owner THEN RETURN NEW; END IF;

  _is_assigned_rider := (OLD.rider_id IS NOT NULL AND OLD.rider_id = _uid);
  IF _is_assigned_rider THEN RETURN NEW; END IF;

  _is_open_rider_claim := (
    OLD.rider_id IS NULL
    AND NEW.rider_id = _uid
    AND public.has_role(_uid, 'rider'::app_role)
    AND OLD.status IN ('ready'::order_status, 'preparing'::order_status)
    AND NEW.status = 'picked_up'::order_status
  );
  IF _is_open_rider_claim THEN RETURN NEW; END IF;

  -- From here: caller must be the customer
  IF _uid IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'orders update not authorized';
  END IF;

  -- Special path: customer boosting delivery fee while no rider yet
  IF NEW.rider_id IS NULL
     AND OLD.rider_id IS NULL
     AND NEW.delivery_fee_boost IS DISTINCT FROM OLD.delivery_fee_boost
  THEN
    _boost_delta := COALESCE(NEW.delivery_fee_boost,0) - COALESCE(OLD.delivery_fee_boost,0);
    IF _boost_delta <= 0 THEN
      RAISE EXCEPTION 'delivery_fee_boost can only increase';
    END IF;
    IF NEW.delivery_fee IS DISTINCT FROM (OLD.delivery_fee + _boost_delta)
       OR NEW.total IS DISTINCT FROM (OLD.total + _boost_delta) THEN
      RAISE EXCEPTION 'delivery_fee and total must increase by the boost delta exactly';
    END IF;
    -- allow re-arming dispatch
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
       OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.discount IS DISTINCT FROM OLD.discount
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.delivery_address IS DISTINCT FROM OLD.delivery_address
       OR NEW.delivery_lat IS DISTINCT FROM OLD.delivery_lat
       OR NEW.delivery_lng IS DISTINCT FROM OLD.delivery_lng
       OR NEW.delivery_distance_km IS DISTINCT FROM OLD.delivery_distance_km
    THEN
      RAISE EXCEPTION 'only delivery_fee_boost / delivery_fee / total / dispatch_wave / last_dispatched_at / awaiting_rider_boost may change on a boost';
    END IF;
    RETURN NEW;
  END IF;

  -- Normal customer-edit rules (kept as before)
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
     OR NEW.rider_id IS DISTINCT FROM OLD.rider_id
     OR NEW.rider_accepted_at IS DISTINCT FROM OLD.rider_accepted_at
     OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
     OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee
     OR NEW.delivery_fee_boost IS DISTINCT FROM OLD.delivery_fee_boost
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
     OR NEW.delivery_distance_km IS DISTINCT FROM OLD.delivery_distance_km
     OR NEW.dispatch_wave IS DISTINCT FROM OLD.dispatch_wave
     OR NEW.last_dispatched_at IS DISTINCT FROM OLD.last_dispatched_at
     OR NEW.awaiting_rider_boost IS DISTINCT FROM OLD.awaiting_rider_boost
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'customers may only modify notes, payment_slip_url, payment_submitted_at, limited status transitions, or boost delivery fee';
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
$function$;

-- 3) SECURITY DEFINER RPC for customer to boost delivery fee
CREATE OR REPLACE FUNCTION public.boost_delivery_fee(_order_id uuid, _amount numeric)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _updated uuid;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 500 THEN RETURN false; END IF;

  UPDATE public.orders
     SET delivery_fee_boost = delivery_fee_boost + _amount,
         delivery_fee = delivery_fee + _amount,
         total = total + _amount,
         dispatch_wave = 3,           -- re-arm at max radius
         last_dispatched_at = now() - interval '20 seconds', -- so cron fires next tick
         awaiting_rider_boost = false,
         updated_at = now()
   WHERE id = _order_id
     AND customer_id = _uid
     AND rider_id IS NULL
     AND status = 'awaiting_confirmations'::order_status
  RETURNING id INTO _updated;

  RETURN _updated IS NOT NULL;
END;
$function$;

-- 4) Enable required extensions for scheduled dispatch ticks
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
