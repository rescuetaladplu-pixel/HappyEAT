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
      user_metadata: { full_name: data.username, role: "admin", username: data.username },
    });
    if (createErr) throw new Error(createErr.message);
    const newId = created.user!.id;

    // Ensure profile + role (trigger may have fired, but be defensive)
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: newId, full_name: data.username, username: data.username });
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: newId, role: "admin" }, { onConflict: "user_id,role" });

    return { ok: true, username: data.username };
  });

export const listAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, created_at, profiles!inner(username, full_name)")
      .eq("role", "admin")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      user_id: r.user_id,
      created_at: r.created_at,
      username: r.profiles?.username ?? null,
      full_name: r.profiles?.full_name ?? null,
    }));
  });
