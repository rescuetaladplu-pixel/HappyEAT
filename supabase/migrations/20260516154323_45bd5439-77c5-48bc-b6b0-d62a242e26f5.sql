ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_otp text;

CREATE OR REPLACE FUNCTION public.generate_delivery_otp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'ready' AND (OLD.status IS DISTINCT FROM 'ready') AND NEW.delivery_otp IS NULL THEN
    NEW.delivery_otp := lpad((floor(random() * 10000))::int::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_delivery_otp ON public.orders;
CREATE TRIGGER trg_generate_delivery_otp
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.generate_delivery_otp();