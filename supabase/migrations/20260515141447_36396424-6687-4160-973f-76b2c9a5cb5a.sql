CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _role app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NEW.raw_user_meta_data->>'username'
  )
  ON CONFLICT (id) DO NOTHING;

  _role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'customer');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- เจ้าของร้าน/ไรเดอร์ ให้มี role customer ควบคู่ด้วย เพื่อให้สั่งอาหารได้
  IF _role IN ('restaurant'::app_role, 'rider'::app_role) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'customer'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill ผู้ใช้เดิมที่เป็นร้านค้า/ไรเดอร์ ให้มี role customer ด้วย
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT ur.user_id, 'customer'::app_role
FROM public.user_roles ur
WHERE ur.role IN ('restaurant'::app_role, 'rider'::app_role)
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = ur.user_id AND ur2.role = 'customer'::app_role
  );