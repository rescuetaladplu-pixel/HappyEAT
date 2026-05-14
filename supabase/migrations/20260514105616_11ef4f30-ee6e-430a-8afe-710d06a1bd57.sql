
-- Roles enum
CREATE TYPE public.app_role AS ENUM ('customer', 'restaurant', 'rider', 'admin');

-- Order status enum
CREATE TYPE public.order_status AS ENUM (
  'pending', 'accepted', 'preparing', 'ready', 'picked_up', 'delivering', 'delivered', 'cancelled'
);

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles (separate table for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role security definer function (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Restaurants
CREATE TABLE public.restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  image_url TEXT,
  address TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  phone TEXT,
  is_open BOOLEAN NOT NULL DEFAULT true,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  rating NUMERIC NOT NULL DEFAULT 0,
  delivery_fee NUMERIC NOT NULL DEFAULT 20,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_restaurants_owner ON public.restaurants(owner_id);

-- Menu items
CREATE TABLE public.menu_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL,
  image_url TEXT,
  category TEXT,
  is_available BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_menu_items_restaurant ON public.menu_items(restaurant_id);

-- Customer addresses
CREATE TABLE public.addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  address TEXT NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

-- Riders
CREATE TABLE public.riders (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_type TEXT,
  license_plate TEXT,
  is_online BOOLEAN NOT NULL DEFAULT false,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  current_lat NUMERIC,
  current_lng NUMERIC,
  rating NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;

-- Orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  rider_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  delivery_address TEXT NOT NULL,
  delivery_lat NUMERIC,
  delivery_lng NUMERIC,
  subtotal NUMERIC NOT NULL,
  delivery_fee NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL,
  status order_status NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL DEFAULT 'cash',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_orders_customer ON public.orders(customer_id);
CREATE INDEX idx_orders_restaurant ON public.orders(restaurant_id);
CREATE INDEX idx_orders_rider ON public.orders(rider_id);
CREATE INDEX idx_orders_status ON public.orders(status);

-- Order items
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  notes TEXT
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_order_items_order ON public.order_items(order_id);

-- Reviews
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_rating INTEGER CHECK (restaurant_rating BETWEEN 1 AND 5),
  rider_rating INTEGER CHECK (rider_rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  );

  -- Default role from signup metadata, fallback to customer
  _role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'customer');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_restaurants_updated BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===================== RLS POLICIES =====================

-- profiles: user manages own; admin can read all
CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- user_roles: user views own; admin manages all
CREATE POLICY "Users view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- restaurants: anyone can view approved+open; owner manages own; admin manages all
CREATE POLICY "Public view approved restaurants" ON public.restaurants
  FOR SELECT TO anon, authenticated USING (is_approved = true OR auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Owners insert restaurants" ON public.restaurants
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id AND public.has_role(auth.uid(), 'restaurant'));
CREATE POLICY "Owners update own restaurant" ON public.restaurants
  FOR UPDATE TO authenticated USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete restaurants" ON public.restaurants
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin') OR auth.uid() = owner_id);

-- menu_items: anyone view available; owner manages own
CREATE POLICY "Public view menu items" ON public.menu_items
  FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND (r.is_approved = true OR r.owner_id = auth.uid()))
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "Owners manage menu items" ON public.menu_items
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid())
  );

-- addresses: user manages own
CREATE POLICY "Users manage own addresses" ON public.addresses
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- riders: rider manages own; admin views all; restaurants/customers can view assigned rider via orders join in app layer
CREATE POLICY "Riders view own" ON public.riders
  FOR SELECT TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Riders insert own" ON public.riders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Riders update own" ON public.riders
  FOR UPDATE TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- orders: customer sees own; restaurant sees orders to their restaurant; rider sees assigned + unassigned online; admin sees all
CREATE POLICY "Customers view own orders" ON public.orders
  FOR SELECT TO authenticated USING (
    auth.uid() = customer_id
    OR auth.uid() = rider_id
    OR EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid())
    OR (public.has_role(auth.uid(), 'rider') AND rider_id IS NULL AND status IN ('ready','preparing'))
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "Customers create orders" ON public.orders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Restaurant/rider/customer update orders" ON public.orders
  FOR UPDATE TO authenticated USING (
    auth.uid() = customer_id
    OR auth.uid() = rider_id
    OR EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = restaurant_id AND r.owner_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
    OR (public.has_role(auth.uid(), 'rider') AND rider_id IS NULL)
  );

-- order_items: same visibility as parent order
CREATE POLICY "View order items via order" ON public.order_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (
      o.customer_id = auth.uid()
      OR o.rider_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.restaurants r WHERE r.id = o.restaurant_id AND r.owner_id = auth.uid())
      OR public.has_role(auth.uid(), 'admin')
    ))
  );
CREATE POLICY "Customers add order items" ON public.order_items
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.customer_id = auth.uid())
  );

-- reviews: customer creates own, anyone reads
CREATE POLICY "Public reads reviews" ON public.reviews
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Customer creates own review" ON public.reviews
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
