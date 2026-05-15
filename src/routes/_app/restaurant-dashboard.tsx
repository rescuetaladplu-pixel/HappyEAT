import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Store, Trash2, ChefHat, Bell, TrendingUp, Tag, MessageSquare } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/restaurant-dashboard")({
  component: RestaurantDashboard,
});

interface Restaurant {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_open: boolean;
  is_approved: boolean;
  delivery_fee: number;
}
interface MenuItem {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
}
interface Order {
  id: string;
  status: string;
  total: number;
  delivery_address: string;
  notes: string | null;
  created_at: string;
}

const NEXT_STATUS: Record<string, string | null> = {
  pending: "accepted",
  accepted: "preparing",
  preparing: "ready",
  ready: null,
};

function RestaurantDashboard() {
  const { user } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Create restaurant form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");

  // Add menu form
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");

  async function load() {
    if (!user) return;
    const { data: r } = await supabase
      .from("restaurants")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();
    setRestaurant(r as Restaurant | null);
    if (r) {
      const [{ data: m }, { data: o }] = await Promise.all([
        supabase.from("menu_items").select("id, name, price, is_available").eq("restaurant_id", r.id).order("created_at"),
        supabase.from("orders").select("id, status, total, delivery_address, notes, created_at").eq("restaurant_id", r.id).order("created_at", { ascending: false }).limit(20),
      ]);
      setItems((m ?? []) as MenuItem[]);
      setOrders((o ?? []) as Order[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase
      .channel("rest-dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function createRestaurant() {
    if (!user || !name) return;
    const { error } = await supabase.from("restaurants").insert({
      owner_id: user.id, name, description, category, is_approved: true, // auto-approve for MVP
    });
    if (error) return toast.error(error.message);
    toast.success("สร้างร้านสำเร็จ");
    setName(""); setDescription(""); setCategory("");
    load();
  }

  async function toggleOpen(open: boolean) {
    if (!restaurant) return;
    await supabase.from("restaurants").update({ is_open: open }).eq("id", restaurant.id);
    setRestaurant({ ...restaurant, is_open: open });
  }

  async function addMenu() {
    if (!restaurant || !itemName || !itemPrice) return;
    const { error } = await supabase.from("menu_items").insert({
      restaurant_id: restaurant.id, name: itemName, price: Number(itemPrice),
    });
    if (error) return toast.error(error.message);
    setItemName(""); setItemPrice("");
    load();
  }

  async function removeMenu(id: string) {
    await supabase.from("menu_items").delete().eq("id", id);
    load();
  }

  async function advanceOrder(o: Order) {
    const next = NEXT_STATUS[o.status];
    if (!next) return;
    await supabase.from("orders").update({ status: next as "accepted" | "preparing" | "ready" }).eq("id", o.id);
  }

  if (loading) return <main className="p-6">กำลังโหลด...</main>;

  if (!restaurant) {
    return (
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-bold">ตั้งค่าร้านของคุณ</h1>
        <Card className="p-5 space-y-3">
          <div className="space-y-2">
            <Label>ชื่อร้าน *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>รายละเอียด</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>หมวดหมู่ (เช่น ตามสั่ง, ก๋วยเตี๋ยว)</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <Button onClick={createRestaurant} className="w-full">
            <Store className="h-4 w-4 mr-2" /> สร้างร้าน
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-4">
      <Card className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold">{restaurant.name}</h1>
            <p className="text-sm text-muted-foreground">{restaurant.category}</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={restaurant.is_open} onCheckedChange={toggleOpen} />
            <span className="text-sm">{restaurant.is_open ? "เปิด" : "ปิด"}</span>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">ออเดอร์ที่เข้ามา</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีออเดอร์</p>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <div key={o.id} className="border border-border rounded-lg p-3">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-medium">#{o.id.slice(0, 8)}</span>
                  <Badge>{o.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{o.delivery_address}</p>
                {o.notes && <p className="text-xs text-muted-foreground italic">หมายเหตุ: {o.notes}</p>}
                <div className="flex justify-between items-center mt-2">
                  <span className="font-semibold text-primary">฿{Number(o.total).toFixed(0)}</span>
                  {NEXT_STATUS[o.status] && (
                    <Button size="sm" onClick={() => advanceOrder(o)}>
                      ไป "{NEXT_STATUS[o.status]}"
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">เมนู ({items.length})</h2>
          <Button asChild size="sm" variant="outline">
            <Link to="/restaurant/menu">
              <ChefHat className="h-4 w-4 mr-2" /> จัดการเมนูเต็มรูปแบบ
            </Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          เพิ่มอย่างเร็วได้ที่นี่ หรือกด "จัดการเมนูเต็มรูปแบบ" เพื่อจัดการหมวดหมู่ + รูป + ตัวเลือกเสริม + เปิดปิดเมนู
        </p>
        <div className="flex gap-2 mb-3">
          <Input placeholder="ชื่อเมนู" value={itemName} onChange={(e) => setItemName(e.target.value)} />
          <Input placeholder="ราคา" type="number" className="w-24" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} />
          <Button size="icon" onClick={addMenu}><Plus className="h-4 w-4" /></Button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">ยังไม่มีเมนู</p>
        ) : (
          <div className="space-y-2">
            {items.slice(0, 5).map((it) => (
              <div key={it.id} className="flex items-center justify-between p-2 rounded border border-border">
                <div>
                  <p className="font-medium">{it.name}</p>
                  <p className="text-sm text-muted-foreground">฿{Number(it.price).toFixed(0)}</p>
                </div>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => removeMenu(it.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {items.length > 5 && (
              <p className="text-xs text-center text-muted-foreground pt-1">
                ยังมีอีก {items.length - 5} รายการ — กด "จัดการเมนูเต็มรูปแบบ"
              </p>
            )}
          </div>
        )}
      </Card>
    </main>
  );
}
