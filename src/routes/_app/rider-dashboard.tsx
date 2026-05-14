import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Bike, MapPin } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/rider-dashboard")({
  component: RiderDashboard,
});

interface Order {
  id: string;
  status: string;
  total: number;
  delivery_address: string;
  rider_id: string | null;
  restaurants: { name: string; address: string | null } | null;
}

function RiderDashboard() {
  const { user } = useAuth();
  const [online, setOnline] = useState(false);
  const [available, setAvailable] = useState<Order[]>([]);
  const [active, setActive] = useState<Order[]>([]);

  async function ensureRider() {
    if (!user) return;
    const { data } = await supabase.from("riders").select("is_online").eq("id", user.id).maybeSingle();
    if (!data) {
      await supabase.from("riders").insert({ id: user.id, is_approved: true });
      setOnline(false);
    } else {
      setOnline(data.is_online);
    }
  }

  async function load() {
    if (!user) return;
    const [{ data: avail }, { data: act }] = await Promise.all([
      supabase
        .from("orders")
        .select("id, status, total, delivery_address, rider_id, restaurants(name, address)")
        .is("rider_id", null)
        .in("status", ["ready", "preparing"])
        .order("created_at"),
      supabase
        .from("orders")
        .select("id, status, total, delivery_address, rider_id, restaurants(name, address)")
        .eq("rider_id", user.id)
        .in("status", ["picked_up", "delivering"])
        .order("created_at"),
    ]);
    setAvailable((avail ?? []) as unknown as Order[]);
    setActive((act ?? []) as unknown as Order[]);
  }

  useEffect(() => {
    ensureRider();
    load();
    const ch = supabase
      .channel("rider-dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function toggleOnline(on: boolean) {
    if (!user) return;
    setOnline(on);
    await supabase.from("riders").update({ is_online: on }).eq("id", user.id);
  }

  async function takeOrder(o: Order) {
    if (!user) return;
    const { error } = await supabase
      .from("orders")
      .update({ rider_id: user.id, status: "picked_up" })
      .eq("id", o.id)
      .is("rider_id", null);
    if (error) return toast.error(error.message);
    toast.success("รับงานสำเร็จ");
    load();
  }

  async function advance(o: Order, next: string) {
    await supabase.from("orders").update({ status: next as "delivering" | "delivered" }).eq("id", o.id);
  }

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-4">
      <Card className="p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bike className="h-6 w-6 text-primary" />
          <div>
            <p className="font-semibold">สถานะออนไลน์</p>
            <p className="text-sm text-muted-foreground">{online ? "พร้อมรับงาน" : "ออฟไลน์"}</p>
          </div>
        </div>
        <Switch checked={online} onCheckedChange={toggleOnline} />
      </Card>

      <section>
        <h2 className="font-semibold mb-2">งานที่กำลังทำ</h2>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">ไม่มีงานปัจจุบัน</p>
        ) : (
          <div className="space-y-2">
            {active.map((o) => (
              <Card key={o.id} className="p-4">
                <div className="flex justify-between mb-1">
                  <span className="font-medium">{o.restaurants?.name}</span>
                  <Badge>{o.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground flex items-start gap-1">
                  <MapPin className="h-3 w-3 mt-1 flex-shrink-0" /> {o.delivery_address}
                </p>
                <div className="flex justify-between items-center mt-2">
                  <span className="font-semibold text-primary">฿{Number(o.total).toFixed(0)}</span>
                  {o.status === "picked_up" && (
                    <Button size="sm" onClick={() => advance(o, "delivering")}>เริ่มส่ง</Button>
                  )}
                  {o.status === "delivering" && (
                    <Button size="sm" onClick={() => advance(o, "delivered")}>ส่งสำเร็จ</Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold mb-2">งานที่รับได้</h2>
        {!online ? (
          <p className="text-sm text-muted-foreground">เปิดสถานะออนไลน์เพื่อดูงาน</p>
        ) : available.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีงานในขณะนี้</p>
        ) : (
          <div className="space-y-2">
            {available.map((o) => (
              <Card key={o.id} className="p-4">
                <div className="flex justify-between mb-1">
                  <span className="font-medium">{o.restaurants?.name}</span>
                  <Badge variant="secondary">{o.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">รับที่: {o.restaurants?.address ?? "—"}</p>
                <p className="text-xs text-muted-foreground flex items-start gap-1 mt-1">
                  <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" /> ส่ง: {o.delivery_address}
                </p>
                <div className="flex justify-between items-center mt-2">
                  <span className="font-semibold text-primary">฿{Number(o.total).toFixed(0)}</span>
                  <Button size="sm" onClick={() => takeOrder(o)}>รับงาน</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
