import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ClipboardList, Star } from "lucide-react";
import { toast } from "sonner";
import { STATUS_LABELS, STATUS_VARIANTS, type OrderStatus } from "@/lib/order-status";
import { PaymentPanel } from "@/components/PaymentPanel";

export const Route = createFileRoute("/_app/orders")({
  component: OrdersPage,
});

interface Order {
  id: string;
  status: OrderStatus;
  total: number;
  subtotal: number;
  created_at: string;
  customer_id: string;
  rider_id: string | null;
  restaurant_id: string;
  payment_method: string;
  payment_slip_url: string | null;
  rejection_reason: string | null;
  restaurants: {
    name: string;
    owner_id: string;
    promptpay_id: string | null;
    promptpay_holder_name: string | null;
  } | null;
}

function OrdersPage() {
  const { user, role } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<Order | null>(null);
  const [restRating, setRestRating] = useState(5);
  const [riderRating, setRiderRating] = useState(5);
  const [comment, setComment] = useState("");

  async function loadOrders() {
    if (!user) return;
    const { data, error } = await supabase
      .from("orders")
      .select("id, status, total, subtotal, created_at, customer_id, rider_id, restaurant_id, payment_method, payment_slip_url, rejection_reason, restaurants(name, owner_id, promptpay_id, promptpay_holder_name)")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) toast.error(error.message);
    const list = (data ?? []) as unknown as Order[];
    setOrders(list);

    const deliveredIds = list.filter((o) => o.status === "delivered" && o.customer_id === user.id).map((o) => o.id);
    if (deliveredIds.length > 0) {
      const { data: rv } = await supabase.from("reviews").select("order_id").in("order_id", deliveredIds);
      setReviewedIds(new Set((rv ?? []).map((r) => r.order_id)));
    }
    setLoading(false);
  }

  useEffect(() => {
    loadOrders();
    if (!user) return;
    const channel = supabase
      .channel("orders-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => loadOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function openReview(o: Order) {
    setReviewing(o);
    setRestRating(5); setRiderRating(5); setComment("");
  }

  async function submitReview() {
    if (!reviewing || !user) return;
    const { error } = await supabase.from("reviews").insert({
      order_id: reviewing.id,
      customer_id: user.id,
      restaurant_rating: restRating,
      rider_rating: reviewing.rider_id ? riderRating : null,
      comment: comment.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("ขอบคุณสำหรับรีวิว!");
    setReviewing(null);
    loadOrders();
  }

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-3">
      <h1 className="text-2xl font-bold mb-2">{role === "rider" ? "ประวัติงาน" : "ออเดอร์"}</h1>
      {loading ? (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="h-12 w-12 mx-auto opacity-30 mb-2" />
          <p>ยังไม่มีออเดอร์</p>
          <Button asChild variant="link" className="mt-2"><Link to="/home">เริ่มสั่งอาหาร</Link></Button>
        </div>
      ) : (
        orders.map((o) => {
          const canReview = o.status === "delivered" && o.customer_id === user?.id && !reviewedIds.has(o.id);
          return (
            <Card key={o.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{o.restaurants?.name ?? "ร้านไม่พบ"}</h3>
                  <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("th-TH")}</p>
                </div>
                <Badge variant={STATUS_VARIANTS[o.status] ?? "secondary"}>{STATUS_LABELS[o.status] ?? o.status}</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">#{o.id.slice(0, 8)}</span>
                <span className="font-semibold text-primary">฿{Number(o.total).toFixed(0)}</span>
              </div>
              {canReview && (
                <Button size="sm" variant="outline" className="w-full mt-3" onClick={() => openReview(o)}>
                  <Star className="h-4 w-4 mr-1" /> ให้คะแนน
                </Button>
              )}
              {o.status === "delivered" && reviewedIds.has(o.id) && (
                <p className="text-xs text-green-600 mt-2 text-center">✓ คุณรีวิวแล้ว</p>
              )}
            </Card>
          );
        })
      )}

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>ให้คะแนน {reviewing?.restaurants?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-2">คะแนนร้าน</p>
              <StarPicker value={restRating} onChange={setRestRating} />
            </div>
            {reviewing?.rider_id && (
              <div>
                <p className="text-sm font-medium mb-2">คะแนนไรเดอร์</p>
                <StarPicker value={riderRating} onChange={setRiderRating} />
              </div>
            )}
            <div>
              <p className="text-sm font-medium mb-2">ความคิดเห็น (ไม่บังคับ)</p>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)}>ยกเลิก</Button>
            <Button onClick={submitReview}>ส่งรีวิว</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} type="button" onClick={() => onChange(s)} className="p-1">
          <Star className={`h-7 w-7 ${s <= value ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
        </button>
      ))}
    </div>
  );
}
