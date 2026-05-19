import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchActiveRestaurantId } from "@/lib/active-restaurant";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Star, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_app/restaurant/reviews")({
  component: RestaurantReviewsPage,
});

interface Review {
  id: string;
  restaurant_rating: number | null;
  rider_rating: number | null;
  comment: string | null;
  created_at: string;
  customer_id: string;
  order_id: string;
}

function RestaurantReviewsPage() {
  const { user } = useAuth();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  async function load(rid: string) {
    const { data: orderIds } = await supabase
      .from("orders").select("id").eq("restaurant_id", rid);
    const ids = (orderIds ?? []).map((o) => o.id);
    if (ids.length === 0) { setReviews([]); setLoading(false); return; }
    const { data } = await supabase
      .from("reviews")
      .select("id, restaurant_rating, rider_rating, comment, created_at, customer_id, order_id")
      .in("order_id", ids)
      .order("created_at", { ascending: false });
    setReviews((data ?? []) as Review[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    fetchActiveRestaurantId(user.id).then((id) => {
      if (id) { setRestaurantId(id); load(id); } else setLoading(false);
    });
  }, [user]);

  const filtered = filter === "all"
    ? reviews
    : reviews.filter((r) => r.restaurant_rating === Number(filter));

  const avg = reviews.length
    ? reviews.filter((r) => r.restaurant_rating).reduce((s, r) => s + (r.restaurant_rating ?? 0), 0)
      / Math.max(1, reviews.filter((r) => r.restaurant_rating).length)
    : 0;

  const distribution = [5, 4, 3, 2, 1].map((s) => ({
    star: s, count: reviews.filter((r) => r.restaurant_rating === s).length,
  }));

  if (loading) return <main className="p-6">กำลังโหลด...</main>;
  if (!restaurantId) {
    return (
      <main className="max-w-2xl mx-auto p-6 text-center space-y-3">
        <p>ยังไม่มีร้าน</p>
        <Button asChild><Link to="/my-restaurant">ไปตั้งค่าร้าน</Link></Button>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto p-4 pb-24 space-y-4">
      <Button asChild variant="ghost" size="sm"><Link to="/my-restaurant"><ArrowLeft className="h-4 w-4 mr-1" />หน้าร้าน</Link></Button>

      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">รีวิวลูกค้า</h1>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-4xl font-bold text-primary">{avg.toFixed(1)}</p>
            <div className="flex items-center justify-center gap-0.5 my-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} className={`h-4 w-4 ${s <= Math.round(avg) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{reviews.length} รีวิว</p>
          </div>
          <div className="flex-1 space-y-1">
            {distribution.map((d) => {
              const pct = reviews.length ? (d.count / reviews.length) * 100 : 0;
              return (
                <div key={d.star} className="flex items-center gap-2 text-xs">
                  <span className="w-3">{d.star}</span>
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right text-muted-foreground">{d.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">ทั้งหมด</TabsTrigger>
          {[5, 4, 3, 2, 1].map((s) => <TabsTrigger key={s} value={String(s)}>{s}★</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">ยังไม่มีรีวิว</Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <Card key={r.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className={`h-4 w-4 ${s <= (r.restaurant_rating ?? 0) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("th-TH")}</span>
              </div>
              {r.comment && <p className="text-sm">{r.comment}</p>}
              <p className="text-xs text-muted-foreground">ออเดอร์ #{r.order_id.slice(0, 8)}</p>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
