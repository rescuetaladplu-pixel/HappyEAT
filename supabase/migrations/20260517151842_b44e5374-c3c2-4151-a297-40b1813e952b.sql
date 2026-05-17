-- Trigger to enforce column-level + transition restrictions for customer-initiated updates
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
  -- Admins bypass all checks
  _is_admin := public.has_role(_uid, 'admin'::app_role);
  IF _is_admin THEN
    RETURN NEW;
  END IF;

  -- Restaurant owner of this order bypasses
  SELECT EXISTS (
    SELECT 1 FROM restaurants r
    WHERE r.id = NEW.restaurant_id AND r.owner_id = _uid
  ) INTO _is_owner;
  IF _is_owner THEN
    RETURN NEW;
  END IF;

  -- Rider already assigned to this order bypasses
  _is_assigned_rider := (OLD.rider_id IS NOT NULL AND OLD.rider_id = _uid);
  IF _is_assigned_rider THEN
    RETURN NEW;
  END IF;

  -- Rider claiming an unassigned ready/preparing order (matches existing RLS)
  _is_open_rider_claim := (
    OLD.rider_id IS NULL
    AND NEW.rider_id = _uid
    AND public.has_role(_uid, 'rider'::app_role)
    AND OLD.status IN ('ready'::order_status, 'preparing'::order_status)
    AND NEW.status = 'picked_up'::order_status
  );
  IF _is_open_rider_claim THEN
    RETURN NEW;
  END IF;

  -- From here on, treat caller as the customer. Enforce strict column-level rules.
  IF _uid IS DISTINCT FROM OLD.customer_id THEN
    RAISE EXCEPTION 'orders update not authorized';
  END IF;

  -- Disallow changes to any sensitive / non-customer fields
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
     OR NEW.rider_id IS DISTINCT FROM OLD.rider_id
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

  -- Enforce allowed status transitions for customer
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'awaiting_payment'::order_status AND NEW.status = 'awaiting_payment_confirm'::order_status)
      OR (OLD.status IN (
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

DROP TRIGGER IF EXISTS trg_enforce_orders_update_authorization ON public.orders;
CREATE TRIGGER trg_enforce_orders_update_authorization
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_orders_update_authorization();
