import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/orders")({
  component: OrdersPage,
});

interface Order {
  id: string;
  status: string;
  total: number;
  created_at: string;
  customer_id: string;
  rider_id: string | null;
  restaurants: { name: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "รอร้านยืนยัน",
  accepted: "ร้านรับออเดอร์",
  preparing: "กำลังทำอาหาร",
  ready: "พร้อมส่ง",
  picked_up: "ไรเดอร์รับงาน",
  delivering: "กำลังส่ง",
  delivered: "ส่งสำเร็จ",
  cancelled: "ยกเลิก",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  accepted: "default",
  preparing: "default",
  ready: "default",
  picked_up: "default",
  delivering: "default",
  delivered: "outline",
  cancelled: "destructive",
};

function OrdersPage() {
  const { user, role } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadOrders() {
    if (!user) return;
    const { data, error } = await supabase
      .from("orders")
      .select("id, status, total, created_at, customer_id, rider_id, restaurants(name)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) toast.error(error.message);
    setOrders((data ?? []) as unknown as Order[]);
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();
    if (!user) return;
    const channel = supabase
      .channel("orders-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => loadOrders())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-3">
      <h1 className="text-2xl font-bold mb-2">{role === "rider" ? "ประวัติงาน" : "ออเดอร์"}</h1>
      {loading ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="h-12 w-12 mx-auto opacity-30 mb-2" />
          <p>ยังไม่มีออเดอร์</p>
          <Button asChild variant="link" className="mt-2">
            <Link to="/home">เริ่มสั่งอาหาร</Link>
          </Button>
        </div>
      ) : (
        orders.map((o) => (
          <Card key={o.id} className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="min-w-0">
                <h3 className="font-semibold truncate">{o.restaurants?.name ?? "ร้านไม่พบ"}</h3>
                <p className="text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleString("th-TH")}
                </p>
              </div>
              <Badge variant={STATUS_VARIANTS[o.status] ?? "secondary"}>
                {STATUS_LABELS[o.status] ?? o.status}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">#{o.id.slice(0, 8)}</span>
              <span className="font-semibold text-primary">฿{Number(o.total).toFixed(0)}</span>
            </div>
          </Card>
        ))
      )}
    </main>
  );
}
