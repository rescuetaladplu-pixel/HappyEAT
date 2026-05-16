-- Split full_name into first_name and last_name
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

-- Backfill: split on first whitespace; if no space, all goes to first_name
UPDATE public.profiles
SET
  first_name = COALESCE(NULLIF(split_part(full_name, ' ', 1), ''), first_name),
  last_name = CASE
    WHEN full_name IS NULL OR position(' ' in full_name) = 0 THEN last_name
    ELSE NULLIF(trim(substring(full_name from position(' ' in full_name) + 1)), '')
  END
WHERE full_name IS NOT NULL;

-- Drop old column
ALTER TABLE public.profiles DROP COLUMN IF EXISTS full_name;

-- Recreate trigger to read first_name/last_name from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _role app_role;
  _first text;
  _last text;
  _legacy_full text;
BEGIN
  _first := COALESCE(NEW.raw_user_meta_data->>'first_name', '');
  _last  := COALESCE(NEW.raw_user_meta_data->>'last_name', '');
  _legacy_full := NEW.raw_user_meta_data->>'full_name';
  IF _first = '' AND _last = '' AND _legacy_full IS NOT NULL AND _legacy_full <> '' THEN
    _first := split_part(_legacy_full, ' ', 1);
    IF position(' ' in _legacy_full) > 0 THEN
      _last := trim(substring(_legacy_full from position(' ' in _legacy_full) + 1));
    END IF;
  END IF;

  INSERT INTO public.profiles (id, first_name, last_name, phone, username)
  VALUES (
    NEW.id,
    _first,
    _last,
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NEW.raw_user_meta_data->>'username'
  )
  ON CONFLICT (id) DO NOTHING;

  _role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'customer');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;