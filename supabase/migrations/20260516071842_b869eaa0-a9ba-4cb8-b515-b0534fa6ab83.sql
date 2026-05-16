
-- New order statuses for two-step QR payment flow
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'awaiting_restaurant';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'awaiting_payment';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'awaiting_payment_confirm';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'payment_rejected';

-- Restaurant PromptPay info
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS promptpay_id text,
  ADD COLUMN IF NOT EXISTS promptpay_holder_name text;

-- Order payment fields
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_slip_url text,
  ADD COLUMN IF NOT EXISTS payment_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS restaurant_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Storage bucket for payment slips (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-slips', 'payment-slips', false)
ON CONFLICT (id) DO NOTHING;

-- Path convention: <order_id>/<filename>
-- Read: customer of the order, restaurant owner of the order, admin
CREATE POLICY "Slip read by order parties"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-slips'
  AND EXISTS (
    SELECT 1 FROM public.orders o
    LEFT JOIN public.restaurants r ON r.id = o.restaurant_id
    WHERE o.id::text = (storage.foldername(name))[1]
      AND (
        o.customer_id = auth.uid()
        OR r.owner_id = auth.uid()
        OR has_role(auth.uid(), 'admin'::app_role)
      )
  )
);

-- Customer of the order can upload slip
CREATE POLICY "Slip upload by customer"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-slips'
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id::text = (storage.foldername(name))[1]
      AND o.customer_id = auth.uid()
  )
);

CREATE POLICY "Slip update by customer"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'payment-slips'
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id::text = (storage.foldername(name))[1]
      AND o.customer_id = auth.uid()
  )
);
