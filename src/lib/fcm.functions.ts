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
// Push to the NEAREST 3 online riders when an order becomes ready.
// First rider to tap "รับงาน" wins (atomic UPDATE … WHERE rider_id IS NULL via RLS).
// Riders without GPS coords are used as fallback to fill up to 3 slots.
// ─────────────────────────────────────────────
const NEAREST_RIDER_COUNT = 3;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

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
    // Resolve restaurant pickup point if not provided
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

    const { data: riders } = await supabaseAdmin
      .from("riders")
      .select("id, current_lat, current_lng")
      .eq("is_online", true)
      .eq("is_approved", true);

    if (!riders || riders.length === 0) return { sent: 0, picked: 0 };

    // Rank by ACTUAL DRIVING DISTANCE using Google Distance Matrix.
    // Pre-filter to up to 10 candidates by straight-line distance to cap API cost,
    // then resolve driving distance and pick the nearest NEAREST_RIDER_COUNT.
    let picked: string[];
    if (pickupLat != null && pickupLng != null) {
      const withCoords = riders
        .map((r) => {
          const lat = r.current_lat != null ? Number(r.current_lat) : null;
          const lng = r.current_lng != null ? Number(r.current_lng) : null;
          if (lat == null || lng == null) return null;
          return { id: r.id, lat, lng, straightKm: haversineKm(pickupLat!, pickupLng!, lat, lng) };
        })
        .filter((x): x is { id: string; lat: number; lng: number; straightKm: number } => x !== null)
        .sort((a, b) => a.straightKm - b.straightKm)
        .slice(0, 10);

      const noCoords = riders
        .filter((r) => r.current_lat == null || r.current_lng == null)
        .map((r) => r.id);

      let ranked: string[] = [];
      const gmapsKey = process.env.GOOGLE_MAPS_API_KEY;
      if (gmapsKey && withCoords.length > 0) {
        try {
          const origin = `${pickupLat},${pickupLng}`;
          const destinations = withCoords.map((r) => `${r.lat},${r.lng}`).join("|");
          const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${encodeURIComponent(destinations)}&mode=driving&key=${gmapsKey}`;
          const res = await fetch(url);
          const json: any = await res.json();
          const elements = json?.rows?.[0]?.elements ?? [];
          const withDriving = withCoords.map((r, i) => {
            const el = elements[i];
            const meters = el?.status === "OK" ? Number(el.distance?.value ?? Number.POSITIVE_INFINITY) : Number.POSITIVE_INFINITY;
            return { id: r.id, meters, straightKm: r.straightKm };
          });
          withDriving.sort((a, b) => a.meters - b.meters || a.straightKm - b.straightKm);
          ranked = withDriving.map((r) => r.id);
        } catch (e) {
          console.error("Distance Matrix failed, falling back to straight-line:", e);
          ranked = withCoords.map((r) => r.id);
        }
      } else {
        ranked = withCoords.map((r) => r.id);
      }

      // Fill remaining slots with no-coord riders if needed
      picked = [...ranked, ...noCoords].slice(0, NEAREST_RIDER_COUNT);
    } else {
      picked = riders.slice(0, NEAREST_RIDER_COUNT).map((r) => r.id);
    }

    if (picked.length === 0) return { sent: 0, picked: 0 };

    const { data: tokens } = await supabaseAdmin
      .from("fcm_tokens")
      .select("token")
      .in("user_id", picked);

    if (!tokens || tokens.length === 0) return { sent: 0, picked: picked.length };

    const accessToken = await getGoogleAccessToken();
    const projectId = getServiceAccount().project_id;
    const title = "🛵 มีงานใหม่ใกล้คุณ!";
    const body = `${restName ?? "ร้าน"} พร้อมส่ง${data.deliveryFee ? ` • ค่าส่ง ฿${data.deliveryFee}` : ""} — ใครรับก่อนได้ก่อน`;
    const link = "/rider-dashboard";

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
                data: { url: link, tag: `pool-${data.orderId}`, orderId: data.orderId },
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
    return { sent, picked: picked.length };
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
