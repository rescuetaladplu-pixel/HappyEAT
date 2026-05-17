ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS promptpay_qr_url text,
  ADD COLUMN IF NOT EXISTS promptpay_mode text NOT NULL DEFAULT 'id';

ALTER TABLE public.restaurants
  ADD CONSTRAINT restaurants_promptpay_mode_check
  CHECK (promptpay_mode IN ('id', 'qr_image'));