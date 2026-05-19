
ALTER TABLE public.app_config DROP CONSTRAINT IF EXISTS app_config_platform_check;
ALTER TABLE public.app_config ADD CONSTRAINT app_config_platform_check
  CHECK (platform IN ('android', 'ios', 'android_rider'));
CREATE UNIQUE INDEX IF NOT EXISTS app_config_platform_key ON public.app_config (platform);
