// Dispatch + delivery-fee server functions.
//
// Customer-facing:
//   - previewDeliveryFee(restaurantId, dropLat, dropLng)
//       Calls OSRM `route` to get driving km from restaurant → drop, applies the
//       tiered calculator (`src/lib/delivery-fee.ts`). Falls back to haversine x
//       1.3 when OSRM is unreachable so checkout never silently shows a wrong
//       price. Pure read — no auth required (we expose restaurant location
//       already on public listings).
//
//   - boostDeliveryFee(orderId, amount)
//       Wraps RPC `boost_delivery_fee` (SECURITY DEFINER). On success the cron
//       tick (or an inline re-dispatch) will broadcast the new fee to every
//       online rider in the 8 km ring.
//
// Server-only helper (consumed by fcm.functions and the dispatch cron):
//   - selectRidersWithinKm — driving-distance ranked rider IDs using OSRM
//     `table`. Used both for the initial nearest-3 wave and the radius waves.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase as browserSupabase } from "@/integrations/supabase/client";
import {
  calcDeliveryFee,
  haversineKm,
  haversineRoadFallbackKm,
} from "@/lib/delivery-fee";

// ─────────────────────────────────────────────
// OSRM driving distance (km) — public OSRM demo server.
// Free, OpenStreetMap-based. Same provider the rider-ranker already uses.
// ─────────────────────────────────────────────
async function osrmDrivingKm(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const json: any = await res.json();
    const meters: number | undefined = json?.routes?.[0]?.distance;
    if (typeof meters !== "number") return null;
    return meters / 1000;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// previewDeliveryFee — used by the cart to show a live fee + total before
// the customer presses "เสนอออเดอร์".
// ─────────────────────────────────────────────
export const previewDeliveryFee = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        restaurantId: z.string().uuid(),
        dropLat: z.number(),
        dropLng: z.number(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    // Read restaurant location with the publishable key — restaurants table
    // is publicly readable for approved rows already.
    const { data: r } = await browserSupabase
      .from("restaurants")
      .select("latitude, longitude")
      .eq("id", data.restaurantId)
      .maybeSingle();
    const lat = r?.latitude != null ? Number(r.latitude) : null;
    const lng = r?.longitude != null ? Number(r.longitude) : null;
    if (lat == null || lng == null) {
      return { distanceKm: null as number | null, fee: 35, source: "default" as const };
    }
    const driving = await osrmDrivingKm(lat, lng, data.dropLat, data.dropLng);
    const distanceKm =
      driving ?? haversineRoadFallbackKm(lat, lng, data.dropLat, data.dropLng);
    return {
      distanceKm,
      fee: calcDeliveryFee(distanceKm),
      source: driving != null ? ("osrm" as const) : ("fallback" as const),
    };
  });

// ─────────────────────────────────────────────
// boostDeliveryFee — customer adds extra 10/20/30฿ to delivery fee when no
// rider has accepted after wave 4. Wrapped RPC enforces:
//   - caller is the order's customer
//   - rider_id IS NULL AND status='awaiting_confirmations'
//   - amount > 0 AND <= 500
// On success returns { ok: true }. The cron tick will re-broadcast within 15s,
// but we also kick an immediate notify here for snappier UX.
// ─────────────────────────────────────────────
export const boostDeliveryFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orderId: z.string().uuid(),
        amount: z.number().int().min(10).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: ok, error } = await supabase.rpc("boost_delivery_fee", {
      _order_id: data.orderId,
      _amount: data.amount,
    });
    if (error) throw new Error(error.message);
    if (!ok) return { ok: false as const };

    // Best-effort immediate re-dispatch so riders see the higher fee right away.
    try {
      const { notifyRidersForWave } = await import("@/lib/fcm.functions");
      await notifyRidersForWave({ data: { orderId: data.orderId, radiusKm: 8 } });
    } catch (e) {
      console.error("immediate re-dispatch after boost failed", e);
    }
    return { ok: true as const };
  });

// ─────────────────────────────────────────────
// Server-only helper: rank online+approved riders by driving distance from a
// pickup point. Returns rider IDs in nearest-first order, optionally limited.
// Riders outside `maxKm` (driving distance) are dropped.
// Riders missing GPS coords are returned at the END (best-effort fallback).
// ─────────────────────────────────────────────
export async function selectRidersWithinKm(
  supabaseAdmin: any,
  pickupLat: number,
  pickupLng: number,
  maxKm: number,
  limit?: number,
): Promise<string[]> {
  const { data: riders } = await supabaseAdmin
    .from("riders")
    .select("id, current_lat, current_lng")
    .eq("is_online", true)
    .eq("is_approved", true);
  if (!riders || riders.length === 0) return [];

  const withCoords = riders
    .map((r: any) => {
      const lat = r.current_lat != null ? Number(r.current_lat) : null;
      const lng = r.current_lng != null ? Number(r.current_lng) : null;
      if (lat == null || lng == null) return null;
      return {
        id: r.id as string,
        lat,
        lng,
        straightKm: haversineKm(pickupLat, pickupLng, lat, lng),
      };
    })
    .filter(
      (x: any): x is { id: string; lat: number; lng: number; straightKm: number } =>
        x !== null,
    )
    // Pre-filter by straight-line distance + small slack to keep OSRM payload small.
    .filter((r: any) => r.straightKm <= maxKm * 1.5)
    .sort((a: any, b: any) => a.straightKm - b.straightKm)
    .slice(0, 20);

  const noCoords = riders
    .filter((r: any) => r.current_lat == null || r.current_lng == null)
    .map((r: any) => r.id as string);

  let ranked: string[] = [];
  if (withCoords.length > 0) {
    try {
      const coords = [
        `${pickupLng},${pickupLat}`,
        ...withCoords.map((r: any) => `${r.lng},${r.lat}`),
      ].join(";");
      const destIdx = withCoords.map((_: any, i: number) => i + 1).join(";");
      const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&destinations=${destIdx}&annotations=distance`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const json: any = await res.json();
      const distances: (number | null)[] = json?.distances?.[0] ?? [];
      const withDriving = withCoords
        .map((r: any, i: number) => ({
          id: r.id,
          meters: distances[i] != null ? Number(distances[i]) : null,
          straightKm: r.straightKm,
        }))
        // Filter by driving distance ≤ maxKm. Missing OSRM → fall back to straight.
        .filter((r: any) =>
          r.meters != null ? r.meters / 1000 <= maxKm : r.straightKm <= maxKm,
        )
        .sort(
          (a: any, b: any) =>
            (a.meters ?? a.straightKm * 1000) - (b.meters ?? b.straightKm * 1000),
        );
      ranked = withDriving.map((r: any) => r.id);
    } catch (e) {
      console.error("OSRM table failed in selectRidersWithinKm:", e);
      ranked = withCoords
        .filter((r: any) => r.straightKm <= maxKm)
        .map((r: any) => r.id);
    }
  }

  const merged = [...ranked, ...noCoords];
  return typeof limit === "number" ? merged.slice(0, limit) : merged;
}
