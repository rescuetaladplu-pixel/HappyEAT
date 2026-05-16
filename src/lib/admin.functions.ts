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
    const { data: riders, error } = await supabaseAdmin
      .from("riders")
      .select("id, is_approved, is_online, vehicle_type, license_plate, rating, current_lat, current_lng, created_at")
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
