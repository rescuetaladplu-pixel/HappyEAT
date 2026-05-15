import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/cart")({
  component: CartPage,
});

function CartPage() {
  const { user } = useAuth();
  const { items, total, setQty, remove, clear, restaurantId } = useCart();
  const navigate = useNavigate();
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deliveryLat, setDeliveryLat] = useState<number | null>(null);
  const [deliveryLng, setDeliveryLng] = useState<number | null>(null);
  const deliveryFee = 30;

  useEffect(() => {
    if (!user) return;
    supabase
      .from("addresses")
      .select("address, latitude, longitude, contact_name, phone_primary, phone_secondary, rider_note")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setAddress((prev) => prev || data.address);
        setDeliveryLat(data.latitude !== null ? Number(data.latitude) : null);
        setDeliveryLng(data.longitude !== null ? Number(data.longitude) : null);
        const parts: string[] = [];
        if (data.contact_name) parts.push(`ผู้รับ: ${data.contact_name}`);
        if (data.phone_primary) parts.push(`โทร: ${data.phone_primary}`);
        if (data.phone_secondary) parts.push(`สำรอง: ${data.phone_secondary}`);
        if (data.rider_note) parts.push(`โน้ต: ${data.rider_note}`);
        const info = parts.join(" | ");
        setContactInfo(info);
        setNotes((prev) => prev || info);
      });
  }, [user]);

  async function handleCheckout() {
    if (!user || !restaurantId || items.length === 0) return;
    if (!address.trim()) return toast.error("กรุณากรอกที่อยู่จัดส่ง");
    setSubmitting(true);

    const subtotal = total;
    const grandTotal = subtotal + deliveryFee;

    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        customer_id: user.id,
        restaurant_id: restaurantId,
        delivery_address: address,
        delivery_lat: deliveryLat,
        delivery_lng: deliveryLng,
        subtotal,
        delivery_fee: deliveryFee,
        total: grandTotal,
        notes,
        payment_method: "cash",
        status: "pending",
      })
      .select()
      .single();

    if (error || !order) {
      setSubmitting(false);
      return toast.error(error?.message || "สั่งไม่สำเร็จ");
    }

    const orderItems = items.map((i) => ({
      order_id: order.id,
      menu_item_id: i.menuItemId,
      name: i.name,
      price: i.price,
      quantity: i.quantity,
    }));
    const { error: itemsErr } = await supabase.from("order_items").insert(orderItems);
    if (itemsErr) {
      setSubmitting(false);
      return toast.error(itemsErr.message);
    }

    clear();
    toast.success("สั่งสำเร็จ! กำลังรอร้านยืนยัน");
    navigate({ to: "/orders" });
  }

  if (items.length === 0) {
    return (
      <main className="max-w-2xl mx-auto p-6 text-center">
        <ShoppingBag className="h-16 w-16 mx-auto opacity-30 mb-3" />
        <h1 className="text-xl font-semibold mb-1">ตะกร้าว่างเปล่า</h1>
        <p className="text-muted-foreground text-sm mb-4">เลือกเมนูจากร้านโปรดของคุณ</p>
        <Button asChild>
          <Link to="/home">เริ่มสั่งอาหาร</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-4 pb-32 space-y-4">
      <h1 className="text-2xl font-bold">ตะกร้าของคุณ</h1>

      <div className="space-y-2">
        {items.map((item) => (
          <Card key={item.menuItemId} className="p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium">{item.name}</h3>
              <p className="text-sm text-muted-foreground">฿{item.price.toFixed(0)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQty(item.menuItemId, item.quantity - 1)}>
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-6 text-center font-medium">{item.quantity}</span>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQty(item.menuItemId, item.quantity + 1)}>
                <Plus className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(item.menuItemId)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">ที่อยู่จัดส่ง</h2>
        <div className="space-y-2">
          <Label htmlFor="addr">ที่อยู่ *</Label>
          <Input id="addr" placeholder="บ้านเลขที่ ถนน เขต/อำเภอ จังหวัด" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">หมายเหตุถึงร้าน</Label>
          <Textarea id="notes" placeholder="เช่น ไม่ใส่ผัก เผ็ดน้อย" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">ยอดอาหาร</span>
          <span>฿{total.toFixed(0)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">ค่าส่ง</span>
          <span>฿{deliveryFee.toFixed(0)}</span>
        </div>
        <div className="flex justify-between font-semibold text-lg pt-2 border-t border-border">
          <span>รวมทั้งหมด</span>
          <span className="text-primary">฿{(total + deliveryFee).toFixed(0)}</span>
        </div>
      </Card>

      <div className="fixed bottom-20 inset-x-0 px-4 z-30">
        <div className="max-w-2xl mx-auto">
          <Button size="lg" className="w-full shadow-lg" onClick={handleCheckout} disabled={submitting}>
            {submitting ? "กำลังสั่ง..." : `สั่งเลย — ฿${(total + deliveryFee).toFixed(0)} (เก็บเงินปลายทาง)`}
          </Button>
        </div>
      </div>
    </main>
  );
}
