ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'awaiting_confirmations' BEFORE 'awaiting_restaurant';

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS rider_accepted_at timestamptz;