-- Create app_config table for version management
CREATE TABLE public.app_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL UNIQUE CHECK (platform IN ('android', 'ios', 'web')),
  latest_version text NOT NULL,
  min_supported_version text NOT NULL,
  apk_download_url text,
  release_notes text,
  force_update boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read version info (needed before login)
CREATE POLICY "Public can read app config"
  ON public.app_config FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only admins can modify
CREATE POLICY "Admins manage app config"
  ON public.app_config FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Auto-update updated_at
CREATE TRIGGER app_config_set_updated_at
  BEFORE UPDATE ON public.app_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed initial row for android
INSERT INTO public.app_config (platform, latest_version, min_supported_version, apk_download_url, release_notes)
VALUES (
  'android',
  '1.0.0',
  '1.0.0',
  'https://happyeat.lovable.app/downloads/happyeat-latest.apk',
  'เวอร์ชันแรกของ HappyEat'
);