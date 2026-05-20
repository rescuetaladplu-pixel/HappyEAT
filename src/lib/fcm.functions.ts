import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ─────────────────────────────────────────────
// Register / refresh an FCM token for the user
// ─────────────────────────────────────────────
export const registerFcmToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        token: z.string().min(20).max(500),
        restaurantId: z.string().uuid().nullable().optional(),
        userAgent: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("fcm_tokens").upsert(
      {
        user_id: userId,
        restaurant_id: data.restaurantId ?? null,
        token: data.token,
        user_agent: data.userAgent ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────────────────────────────────────────
// Send push to every token of the restaurant owner
// (Called server-side when a new order is placed)
// ─────────────────────────────────────────────
export const sendOrderPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid(),
        restaurantId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    // Find tokens belonging to the restaurant owner
    const { data: restaurant } = await supabaseAdmin
      .from("restaurants")
      .select("owner_id, name")
      .eq("id", data.restaurantId)
      .maybeSingle();

    if (!restaurant?.owner_id) return { sent: 0 };

    const { data: tokens } = await supabaseAdmin
      .from("fcm_tokens")
      .select("token")
      .eq("user_id", restaurant.owner_id);

    if (!tokens || tokens.length === 0) return { sent: 0 };

    const accessToken = await getGoogleAccessToken();
    const projectId = getServiceAccount().project_id;

    let sent = 0;
    const staleTokens: string[] = [];
    await Promise.all(
      tokens.map(async (t) => {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token: t.token,
                notification: {
                  title: "🔔 มีออเดอร์ใหม่!",
                  body: `ร้าน ${restaurant.name ?? ""} มีออเดอร์รอรับ`,
                },
                data: {
                  orderId: data.orderId,
                  url: "/restaurant/orders",
                  tag: `order-${data.orderId}`,
                },
                webpush: {
                  fcm_options: { link: "/restaurant/orders" },
                },
              },
            }),
          },
        );
        if (res.ok) {
          sent++;
        } else {
          const errBody = await res.text();
          // Token no longer valid → clean up
          if (res.status === 404 || res.status === 400 || errBody.includes("UNREGISTERED")) {
            staleTokens.push(t.token);
          }
          console.error("FCM send failed", res.status, errBody);
        }
      }),
    );

    if (staleTokens.length > 0) {
      await supabaseAdmin.from("fcm_tokens").delete().in("token", staleTokens);
    }

    return { sent };
  });

// ─────────────────────────────────────────────
// Send a generic push to a specific user
// (Used for order status transitions: customer ⇄ restaurant)
// ─────────────────────────────────────────────
export const sendStatusPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        targetUserId: z.string().uuid(),
        title: z.string().min(1).max(200),
        body: z.string().min(1).max(500),
        url: z.string().max(500).optional(),
        tag: z.string().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: tokens } = await supabaseAdmin
      .from("fcm_tokens")
      .select("token")
      .eq("user_id", data.targetUserId);
    if (!tokens || tokens.length === 0) return { sent: 0 };

    const accessToken = await getGoogleAccessToken();
    const projectId = getServiceAccount().project_id;
    const link = data.url ?? "/orders";

    let sent = 0;
    const stale: string[] = [];
    await Promise.all(
      tokens.map(async (t) => {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token: t.token,
                notification: { title: data.title, body: data.body },
                data: { url: link, tag: data.tag ?? link },
                webpush: { fcm_options: { link } },
              },
            }),
          },
        );
        if (res.ok) sent++;
        else {
          const errBody = await res.text();
          if (res.status === 404 || res.status === 400 || errBody.includes("UNREGISTERED")) {
            stale.push(t.token);
          }
        }
      }),
    );
    if (stale.length > 0) {
      await supabaseAdmin.from("fcm_tokens").delete().in("token", stale);
    }
    return { sent };
  });

// ─────────────────────────────────────────────
// Push order to riders.
//   - Wave 0 (initial): nearest 3 within 4 km
//   - Wave 1: all riders within 4 km
//   - Wave 2: all riders within 6 km
//   - Wave 3: all riders within 8 km
//   - Wave 4: stop pushing, surface "boost delivery fee" UI to the customer
//
// `notifyRidersOrderReady` keeps the original behavior for the initial
// dispatch (3-nearest within 4 km). The cron tick uses `notifyRidersForWave`
// to broadcast subsequent radius waves.
// ─────────────────────────────────────────────
import { selectRidersWithinKm } from "@/lib/dispatch.functions";

const NEAREST_RIDER_COUNT = 3;
const INITIAL_RADIUS_KM = 4;

async function pushToRiderTokens(params: {
  pickedRiderIds: string[];
  orderId: string;
  title: string;
  body: string;
  link?: string;
}): Promise<{ sent: number; picked: number }> {
  const { pickedRiderIds, orderId, title, body } = params;
  const link = params.link ?? "/rider-dashboard";
  if (pickedRiderIds.length === 0) return { sent: 0, picked: 0 };

  const { data: tokens } = await supabaseAdmin
    .from("fcm_tokens")
    .select("token")
    .in("user_id", pickedRiderIds);

  if (!tokens || tokens.length === 0) return { sent: 0, picked: pickedRiderIds.length };

  const accessToken = await getGoogleAccessToken();
  const projectId = getServiceAccount().project_id;

  let sent = 0;
  const stale: string[] = [];
  await Promise.all(
    tokens.map(async (t) => {
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: t.token,
              notification: { title, body },
              data: { url: link, tag: `pool-${orderId}`, orderId },
              webpush: { fcm_options: { link } },
            },
          }),
        },
      );
      if (res.ok) sent++;
      else {
        const errBody = await res.text();
        if (res.status === 404 || res.status === 400 || errBody.includes("UNREGISTERED")) {
          stale.push(t.token);
        }
      }
    }),
  );
  if (stale.length > 0) {
    await supabaseAdmin.from("fcm_tokens").delete().in("token", stale);
  }
  return { sent, picked: pickedRiderIds.length };
}

// Initial wave (called inline from cart checkout) — nearest 3 within 4 km.
export const notifyRidersOrderReady = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid(),
        restaurantId: z.string().uuid().optional(),
        restaurantName: z.string().max(200).optional(),
        restaurantLat: z.number().optional(),
        restaurantLng: z.number().optional(),
        deliveryFee: z.number().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    let pickupLat = data.restaurantLat;
    let pickupLng = data.restaurantLng;
    let restName = data.restaurantName;
    if ((pickupLat == null || pickupLng == null || !restName) && data.restaurantId) {
      const { data: r } = await supabaseAdmin
        .from("restaurants")
        .select("latitude, longitude, name")
        .eq("id", data.restaurantId)
        .maybeSingle();
      if (r) {
        pickupLat = pickupLat ?? (r.latitude != null ? Number(r.latitude) : undefined);
        pickupLng = pickupLng ?? (r.longitude != null ? Number(r.longitude) : undefined);
        restName = restName ?? r.name;
      }
    }

    let picked: string[] = [];
    if (pickupLat != null && pickupLng != null) {
      picked = await selectRidersWithinKm(
        supabaseAdmin,
        pickupLat,
        pickupLng,
        INITIAL_RADIUS_KM,
        NEAREST_RIDER_COUNT,
      );
    } else {
      // No restaurant location → blast to first N online riders.
      const { data: riders } = await supabaseAdmin
        .from("riders")
        .select("id")
        .eq("is_online", true)
        .eq("is_approved", true)
        .limit(NEAREST_RIDER_COUNT);
      picked = (riders ?? []).map((r) => r.id as string);
    }

    return pushToRiderTokens({
      pickedRiderIds: picked,
      orderId: data.orderId,
      title: "🛵 มีงานใหม่ใกล้คุณ!",
      body: `${restName ?? "ร้าน"} พร้อมส่ง${data.deliveryFee ? ` • ค่าส่ง ฿${data.deliveryFee}` : ""} — ใครรับก่อนได้ก่อน`,
    });
  });

// Subsequent waves (called by /api/public/hooks/dispatch-tick and by
// boostDeliveryFee). Looks the order up to get the current fee + restaurant
// location, then broadcasts to ALL riders within `radiusKm`.
export const notifyRidersForWave = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid(),
        radiusKm: z.number().min(1).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select(
        "id, delivery_fee, restaurant_id, restaurants(name, latitude, longitude)",
      )
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { sent: 0, picked: 0 };
    const rest = (order as any).restaurants as
      | { name: string; latitude: number | null; longitude: number | null }
      | null;
    const pickupLat = rest?.latitude != null ? Number(rest.latitude) : null;
    const pickupLng = rest?.longitude != null ? Number(rest.longitude) : null;
    if (pickupLat == null || pickupLng == null) return { sent: 0, picked: 0 };

    const picked = await selectRidersWithinKm(
      supabaseAdmin,
      pickupLat,
      pickupLng,
      data.radiusKm,
    );
    return pushToRiderTokens({
      pickedRiderIds: picked,
      orderId: data.orderId,
      title: `🛵 ยังมีงานรอ — รัศมี ${data.radiusKm} กม.`,
      body: `${rest?.name ?? "ร้าน"} • ค่าส่ง ฿${Number(order.delivery_fee).toFixed(0)} — ใครรับก่อนได้ก่อน`,
    });
  });

// ─────────────────────────────────────────────
// Google OAuth2 access token from service account
// (JWT → exchange for short-lived bearer)
// ─────────────────────────────────────────────
let cachedToken: { token: string; expiresAt: number } | null = null;

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

function getServiceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
  return JSON.parse(raw) as ServiceAccount;
}

async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const sa = getServiceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = (obj: object) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const unsigned = `${enc(header)}.${enc(payload)}`;

  // Web Crypto sign (works in Cloudflare Workers + Node)
  const pem = sa.private_key.replace(/\\n/g, "\n");
  const keyData = pemToArrayBuffer(pem);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const sigB64 = Buffer.from(sig)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${unsigned}.${sigB64}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = Buffer.from(b64, "base64");
  return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
}
