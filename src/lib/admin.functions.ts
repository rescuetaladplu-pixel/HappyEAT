import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMIN_EMAIL_DOMAIN = "admin.local";

const createAdminSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "username อย่างน้อย 3 ตัว")
    .max(32, "username ไม่เกิน 32 ตัว")
    .regex(/^[a-z0-9_]+$/, "ใช้ได้เฉพาะ a-z, 0-9, _"),
  password: z.string().min(6, "รหัสผ่านอย่างน้อย 6 ตัว").max(72),
});

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("เฉพาะแอดมินเท่านั้น");
}

export const createAdminAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createAdminSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const email = `${data.username}@${ADMIN_EMAIL_DOMAIN}`;

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { first_name: data.username, last_name: "", role: "admin", username: data.username },
    });
    if (createErr) throw new Error(createErr.message);
    const newId = created.user!.id;

    // Ensure profile + role (trigger may have fired, but be defensive)
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: newId, first_name: data.username, last_name: "", username: data.username });
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: newId, role: "admin" }, { onConflict: "user_id,role" });

    return { ok: true, username: data.username };
  });

export const listAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: roleRows, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, created_at")
      .eq("role", "admin")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = (roleRows ?? []).map((r) => r.user_id);
    if (ids.length === 0) return [];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, username, first_name, last_name")
      .in("id", ids);
    const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return (roleRows ?? []).map((r) => {
      const p: any = pmap.get(r.user_id) ?? {};
      return {
        user_id: r.user_id,
        created_at: r.created_at,
        username: p.username ?? null,
        first_name: p.first_name ?? null,
        last_name: p.last_name ?? null,
      };
    });
  });

export const confirmUserEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        password: z.string().min(6, "รหัสผ่านอย่างน้อย 6 ตัว").max(72),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAllUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    // Fetch auth users (paginated, up to 1000 — sufficient for early stage)
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (authErr) throw new Error(authErr.message);

    const userIds = authData.users.map((u) => u.id);

    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, first_name, last_name, phone, username, avatar_url").in("id", userIds),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", userIds),
    ]);

    const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const rolesMap = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = rolesMap.get((r as any).user_id) ?? [];
      arr.push((r as any).role);
      rolesMap.set((r as any).user_id, arr);
    }

    return authData.users
      .map((u) => {
        const p: any = profileMap.get(u.id) ?? {};
        return {
          user_id: u.id,
          email: u.email ?? null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
          email_confirmed: !!u.email_confirmed_at,
          first_name: p.first_name ?? null,
          last_name: p.last_name ?? null,
          phone: p.phone ?? null,
          username: p.username ?? null,
          avatar_url: p.avatar_url ?? null,
          roles: rolesMap.get(u.id) ?? [],
        };
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  });

// ---------------- Restaurant management ----------------

export const listRestaurantsForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("restaurants")
      .select("id, name, owner_id, is_approved, is_open, category, phone, address, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const approveRestaurant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ is_approved: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const suspendRestaurant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ is_approved: false, is_open: false })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRestaurant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("restaurants").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Rider management ----------------

export const listRidersForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    // Only users that actually hold the 'rider' role — exclude admins
    // who may have stray rows in the `riders` table.
    const { data: roleRows, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "rider");
    if (roleErr) throw new Error(roleErr.message);
    const riderIds = new Set((roleRows ?? []).map((r: any) => r.user_id as string));
    if (riderIds.size === 0) return [];

    const { data: riders, error } = await supabaseAdmin
      .from("riders")
      .select("id, is_approved, is_online, vehicle_type, license_plate, rating, current_lat, current_lng, created_at")
      .in("id", Array.from(riderIds))
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (riders ?? []).map((r) => r.id);
    if (ids.length === 0) return [];

    const [{ data: profiles }, { data: authData }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, first_name, last_name, phone").in("id", ids),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const emap = new Map(authData.users.map((u) => [u.id, u.email ?? null]));

    return (riders ?? []).map((r) => {
      const p: any = pmap.get(r.id) ?? {};
      return {
        ...r,
        first_name: p.first_name ?? null,
        last_name: p.last_name ?? null,
        phone: p.phone ?? null,
        email: emap.get(r.id) ?? null,
      };
    });
  });

export const approveRider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("riders")
      .update({ is_approved: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const suspendRider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("riders")
      .update({ is_approved: false, is_online: false })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Orders monitoring ----------------

export const listRecentOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(100).default(10) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: orders, error } = await supabaseAdmin
      .from("orders")
      .select("id, status, total, created_at, customer_id, restaurant_id, rider_id, restaurants(name)")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return orders ?? [];
  });

export const listActiveDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select("id, status, total, delivery_address, created_at, rider_id, restaurants(name)")
      .not("rider_id", "is", null)
      .in("status", ["picked_up", "delivering"])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const ORDER_STATUSES = [
  "awaiting_confirmations",
  "awaiting_restaurant",
  "awaiting_payment",
  "awaiting_payment_confirm",
  "payment_rejected",
  "preparing",
  "ready",
  "picked_up",
  "delivering",
  "delivered",
  "cancelled",
] as const;

export const listAllOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.enum(ORDER_STATUSES).nullable().optional(),
        search: z.string().trim().max(120).optional(),
        limit: z.number().int().min(1).max(200).default(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let q = supabaseAdmin
      .from("orders")
      .select(
        "id, status, total, subtotal, delivery_fee, discount, payment_method, delivery_address, created_at, customer_id, restaurant_id, rider_id, restaurants(name)",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    const { data: orders, error } = await q;
    if (error) throw new Error(error.message);
    let rows = orders ?? [];
    if (data.search) {
      const s = data.search.toLowerCase();
      rows = rows.filter(
        (o: any) =>
          o.id.toLowerCase().includes(s) ||
          (o.restaurants?.name ?? "").toLowerCase().includes(s) ||
          (o.delivery_address ?? "").toLowerCase().includes(s),
      );
    }
    return rows;
  });

export const adminUpdateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        status: z.enum(ORDER_STATUSES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    // ใช้ context.supabase (มี auth ของ admin user) เพื่อให้ trigger enforce_orders_update_authorization
    // เห็นว่า auth.uid() เป็น admin จริง — supabaseAdmin ใช้ service role auth.uid()=NULL ทำให้ trigger reject
    const { error } = await context.supabase
      .from("orders")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminCancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await context.supabase
      .from("orders")
      .update({
        status: "cancelled",
        rejection_reason: data.reason ?? "ยกเลิกโดยแอดมิน",
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Detail views ----------------

export const getOrderDetailForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ orderId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("*, restaurants(id, name, phone, address, owner_id, promptpay_qr_url, promptpay_holder_name, promptpay_id)")
      .eq("id", data.orderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) throw new Error("ไม่พบออเดอร์");

    const [{ data: items }, { data: promos }, { data: profiles }, { data: authData }, { data: reviews }] =
      await Promise.all([
        supabaseAdmin.from("order_items").select("*").eq("order_id", data.orderId),
        supabaseAdmin.from("order_promotions").select("*").eq("order_id", data.orderId),
        supabaseAdmin
          .from("profiles")
          .select("id, first_name, last_name, phone, username, avatar_url")
          .in("id", [order.customer_id, order.rider_id].filter(Boolean) as string[]),
        supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        supabaseAdmin.from("reviews").select("*").eq("order_id", data.orderId),
      ]);

    const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const emap = new Map(authData.users.map((u) => [u.id, u.email ?? null]));
    const customer = pmap.get(order.customer_id) as any | undefined;
    const rider = order.rider_id ? (pmap.get(order.rider_id) as any | undefined) : null;

    return {
      order,
      items: items ?? [],
      promotions: promos ?? [],
      reviews: reviews ?? [],
      customer: customer
        ? { ...customer, email: emap.get(order.customer_id) ?? null }
        : { id: order.customer_id, email: emap.get(order.customer_id) ?? null },
      rider: rider
        ? { ...rider, email: emap.get(order.rider_id!) ?? null }
        : null,
    };
  });

export const getUserDetailForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: authUser, error: aErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (aErr) throw new Error(aErr.message);
    if (!authUser?.user) throw new Error("ไม่พบผู้ใช้");

    const [{ data: profile }, { data: roles }, { data: restaurants }, { data: orders }, { data: addresses }, { data: rider }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("*").eq("id", data.userId).maybeSingle(),
        supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId),
        supabaseAdmin
          .from("restaurants")
          .select("id, name, is_approved, is_open, category, phone, address, created_at")
          .eq("owner_id", data.userId)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("orders")
          .select("id, status, total, created_at, restaurants(name)")
          .or(`customer_id.eq.${data.userId},rider_id.eq.${data.userId}`)
          .order("created_at", { ascending: false })
          .limit(50),
        supabaseAdmin.from("addresses").select("*").eq("user_id", data.userId),
        supabaseAdmin.from("riders").select("*").eq("id", data.userId).maybeSingle(),
      ]);

    return {
      user: {
        user_id: authUser.user.id,
        email: authUser.user.email ?? null,
        created_at: authUser.user.created_at,
        last_sign_in_at: authUser.user.last_sign_in_at ?? null,
        email_confirmed: !!authUser.user.email_confirmed_at,
      },
      profile: profile ?? null,
      roles: (roles ?? []).map((r: any) => r.role as string),
      restaurants: restaurants ?? [],
      orders: orders ?? [],
      addresses: addresses ?? [],
      rider: rider ?? null,
    };
  });

export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) {
      throw new Error("ลบบัญชีตัวเองไม่ได้");
    }
    // Block deleting other admins to avoid lockout / accidents
    const { data: adminRow } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", data.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (adminRow) throw new Error("ลบบัญชีแอดมินคนอื่นไม่ได้");

    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getRestaurantDetailForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ restaurantId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: restaurant, error: rErr } = await supabaseAdmin
      .from("restaurants")
      .select("*")
      .eq("id", data.restaurantId)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!restaurant) throw new Error("ไม่พบร้านค้า");

    const [
      { data: owner },
      { data: ownerAuth },
      { data: menuItems },
      { data: categories },
      { data: orders },
      { data: promotions },
      { data: reviews },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", restaurant.owner_id).maybeSingle(),
      supabaseAdmin.auth.admin.getUserById(restaurant.owner_id),
      supabaseAdmin
        .from("menu_items")
        .select("id, name, price, is_available, category, image_url, sort_order")
        .eq("restaurant_id", data.restaurantId)
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("menu_categories")
        .select("id, name, sort_order")
        .eq("restaurant_id", data.restaurantId),
      supabaseAdmin
        .from("orders")
        .select("id, status, total, created_at, customer_id")
        .eq("restaurant_id", data.restaurantId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("promotions")
        .select("id, code, type, value, is_active, used_count, usage_limit, starts_at, ends_at")
        .eq("restaurant_id", data.restaurantId),
      supabaseAdmin
        .from("reviews")
        .select("id, restaurant_rating, rider_rating, comment, owner_reply, created_at, order_id")
        .in(
          "order_id",
          (
            await supabaseAdmin
              .from("orders")
              .select("id")
              .eq("restaurant_id", data.restaurantId)
              .limit(200)
          ).data?.map((o: any) => o.id) ?? [],
        )
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const stats = {
      ordersTotal: orders?.length ?? 0,
      ordersDelivered: orders?.filter((o: any) => o.status === "delivered").length ?? 0,
      ordersCancelled: orders?.filter((o: any) => o.status === "cancelled").length ?? 0,
      revenue: (orders ?? [])
        .filter((o: any) => o.status === "delivered")
        .reduce((s: number, o: any) => s + Number(o.total ?? 0), 0),
      menuTotal: menuItems?.length ?? 0,
      menuAvailable: menuItems?.filter((m: any) => m.is_available).length ?? 0,
    };

    return {
      restaurant,
      owner: owner ?? null,
      ownerEmail: ownerAuth?.user?.email ?? null,
      menuItems: menuItems ?? [],
      categories: categories ?? [],
      orders: orders ?? [],
      promotions: promotions ?? [],
      reviews: reviews ?? [],
      stats,
    };
  });
