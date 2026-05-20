// pg_cron hits this every 15 seconds to advance dispatch waves on orders that
// still don't have a rider.
//
// Wave timeline (since last dispatch):
//   wave 0 → wave 1 after 15s : push to ALL riders within 4 km
//   wave 1 → wave 2 after 15s : push to ALL riders within 6 km
//   wave 2 → wave 3 after 15s : push to ALL riders within 8 km
//   wave 3 → wave 4 after 15s : stop pushing, surface "เพิ่มค่าส่ง" UI on the
//                               customer side via awaiting_rider_boost = true
//
// Wave 0 is fired inline by the cart on order creation (notifyRidersOrderReady).
// This route never touches orders that already have a rider.

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { notifyRidersForWave } from "@/lib/fcm.functions";

const WAVE_RADIUS_KM: Record<number, number> = {
  // wave we're TRANSITIONING TO → radius pushed
  1: 4,
  2: 6,
  3: 8,
};

export const Route = createFileRoute("/api/public/hooks/dispatch-tick")({
  server: {
    handlers: {
      POST: async () => {
        // Eligible: still in confirmations, no rider, last dispatch ≥14s ago.
        const { data: pending, error } = await supabaseAdmin
          .from("orders")
          .select("id, dispatch_wave, last_dispatched_at")
          .eq("status", "awaiting_confirmations")
          .is("rider_id", null)
          .lt("dispatch_wave", 4)
          .lt("last_dispatched_at", new Date(Date.now() - 14_000).toISOString())
          .limit(50);

        if (error) {
          console.error("dispatch-tick: query failed", error);
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const results: Array<{ orderId: string; wave: number; sent?: number }> = [];

        for (const o of pending ?? []) {
          const nextWave = (o.dispatch_wave ?? 0) + 1;
          if (nextWave >= 4) {
            // Final state: stop pushing, ask customer to consider boosting.
            await supabaseAdmin
              .from("orders")
              .update({
                dispatch_wave: 4,
                last_dispatched_at: new Date().toISOString(),
                awaiting_rider_boost: true,
              })
              .eq("id", o.id);
            results.push({ orderId: o.id, wave: 4 });
            continue;
          }
          const radiusKm = WAVE_RADIUS_KM[nextWave];
          try {
            const res = await notifyRidersForWave({
              data: { orderId: o.id, radiusKm },
            });
            await supabaseAdmin
              .from("orders")
              .update({
                dispatch_wave: nextWave,
                last_dispatched_at: new Date().toISOString(),
                awaiting_rider_boost: false,
              })
              .eq("id", o.id);
            results.push({ orderId: o.id, wave: nextWave, sent: res.sent });
          } catch (e) {
            console.error("dispatch-tick: notifyRidersForWave failed", o.id, e);
          }
        }

        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
