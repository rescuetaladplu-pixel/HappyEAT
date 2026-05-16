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
import { Minus, Plus, Trash2, ShoppingBag, QrCode } from "lucide-react";
import { toast } from "sonner";
import { sendOrderPush } from "@/lib/fcm.functions";

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
  const [savedAddrs, setSavedAddrs] = useState<Array<{
    id: string; label: string; address: string;
    latitude: number | null; longitude: number | null;
    contact_name: string | null; phone_primary: string | null;
    phone_secondary: string | null; rider_note: string | null;
    is_default: boolean;
  }>>([]);
  const [selectedAddrId, setSelectedAddrId] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState("");
  const [promo, setPromo] = useState<{ id: string; code: string; discount: number } | null>(null);
  const [checking, setChecking] = useState(false);
  const [restaurantHasPromptpay, setRestaurantHasPromptpay] = useState<boolean | null>(null);
  const deliveryFee = 30;
  const discount = promo?.discount ?? 0;

  async function applyPromo() {
    if (!restaurantId || !promoCode.trim()) return;
    setChecking(true);
    const code = promoCode.trim().toUpperCase();
    const { data, error } = await supabase
      .from("promotions")
      .select("id, code, type, value, min_order, max_discount, starts_at, ends_at, usage_limit, used_count, is_active")
      .eq("restaurant_id", restaurantId)
      .eq("code", code)
      .maybeSingle();
    setChecking(false);
    if (error || !data) return toast.error("ไม่พบคูปองนี้");
    if (!data.is_active) return toast.error("คูปองถูกปิดใช้งาน");
    const now = new Date();
    if (data.starts_at && new Date(data.starts_at) > now) return toast.error("คูปองยังไม่เริ่มใช้");
    if (data.ends_at && new Date(data.ends_at) < now) return toast.error("คูปองหมดอายุ");
    if (data.usage_limit !== null && data.used_count >= data.usage_limit) return toast.error("คูปองถูกใช้ครบแล้ว");
    if (Number(data.min_order) > total) return toast.error(`ต้องสั่งขั้นต่ำ ฿${data.min_order}`);

    let d = data.type === "percent" ? (total * Number(data.value)) / 100 : Number(data.value);
    if (data.max_discount) d = Math.min(d, Number(data.max_discount));
    d = Math.min(d, total);
    setPromo({ id: data.id, code: data.code, discount: Math.round(d) });
    toast.success(`ใช้คูปอง ${data.code} ลด ฿${Math.round(d)}`);
  }

  function applySavedAddr(a: typeof savedAddrs[number]) {
    setSelectedAddrId(a.id);
    setAddress(a.address);
    setDeliveryLat(a.latitude !== null ? Number(a.latitude) : null);
    setDeliveryLng(a.longitude !== null ? Number(a.longitude) : null);
    const parts: string[] = [];
    if (a.contact_name) parts.push(`ผู้รับ: ${a.contact_name}`);
    if (a.phone_primary) parts.push(`โทร: ${a.phone_primary}`);
    if (a.phone_secondary) parts.push(`สำรอง: ${a.phone_secondary}`);
    if (a.rider_note) parts.push(`โน้ต: ${a.rider_note}`);
    setNotes(parts.join(" | "));
  }

  useEffect(() => {
    if (!user) return;
    supabase
      .from("addresses")
      .select("id, label, address, latitude, longitude, contact_name, phone_primary, phone_secondary, rider_note, is_default")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(3)
      .then(({ data }) => {
        const rows = (data ?? []) as typeof savedAddrs;
        setSavedAddrs(rows);
        const def = rows.find((r) => r.is_default) ?? rows[0];
        if (def) applySavedAddr(def);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Check if the cart's restaurant has PromptPay configured
  useEffect(() => {
    if (!restaurantId) {
      setRestaurantHasPromptpay(null);
      return;
    }
    supabase
      .from("restaurants")
      .select("promptpay_id")
      .eq("id", restaurantId)
      .maybeSingle()
      .then(({ data }) => {
        const has = !!data?.promptpay_id;
        setRestaurantHasPromptpay(has);
      });
  }, [restaurantId]);

  async function handleCheckout() {
    if (!user || !restaurantId || items.length === 0) return;
    if (!address.trim()) return toast.error("กรุณากรอกที่อยู่จัดส่ง");
    if (!restaurantHasPromptpay) return toast.error("ร้านนี้ยังไม่ได้ตั้งค่า PromptPay จึงรับออเดอร์ไม่ได้");
    setSubmitting(true);

    const subtotal = total;
    const grandTotal = subtotal + deliveryFee - discount;

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
        discount,
        total: grandTotal,
        notes,
        payment_method: "promptpay_qr",
        status: "awaiting_restaurant",
      })
      .select()
      .single();

    if (error || !order) {
      setSubmitting(false);
      return toast.error(error?.message || "สั่งไม่สำเร็จ");
    }

    const orderItems = items.map((i) => {
      const noteParts: string[] = [];
      if (i.addons.length > 0) {
        noteParts.push(
          i.addons.map((a) => `${a.groupName}: ${a.optionName}`).join(", "),
        );
      }
      if (i.note) noteParts.push(i.note);
      return {
        order_id: order.id,
        menu_item_id: i.menuItemId,
        name: i.name,
        price: i.unitPrice,
        quantity: i.quantity,
        notes: noteParts.length > 0 ? noteParts.join(" | ") : null,
      };
    });
    const { error: itemsErr } = await supabase.from("order_items").insert(orderItems);
    if (itemsErr) {
      setSubmitting(false);
      return toast.error(itemsErr.message);
    }

    if (promo) {
      await supabase.from("order_promotions").insert({
        order_id: order.id,
        promotion_id: promo.id,
        code: promo.code,
        discount_amount: promo.discount,
      });
      const { data: cur } = await supabase.from("promotions").select("used_count").eq("id", promo.id).maybeSingle();
      if (cur) await supabase.from("promotions").update({ used_count: (cur.used_count ?? 0) + 1 }).eq("id", promo.id);
    }

    clear();
    toast.success("ส่งคำขอแล้ว! รอร้านยืนยันความพร้อม");

    // Fire-and-forget push to the restaurant owner.
    // We don't await — order is already saved; push is best-effort.
    sendOrderPush({ data: { orderId: order.id, restaurantId } }).catch((e) => {
      console.error("sendOrderPush failed", e);
    });

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
          <Card key={item.lineId} className="p-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium">{item.name}</h3>
              {item.addons.length > 0 && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {item.addons.map((a) => a.optionName).join(", ")}
                </p>
              )}
              <p className="text-sm text-muted-foreground">฿{item.unitPrice.toFixed(0)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQty(item.lineId, item.quantity - 1)}>
                <Minus className="h-3 w-3" />
              </Button>
              <span className="w-6 text-center font-medium">{item.quantity}</span>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQty(item.lineId, item.quantity + 1)}>
                <Plus className="h-3 w-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(item.lineId)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">ที่อยู่จัดส่ง</h2>
          <Link to="/home" className="text-xs text-primary underline">จัดการที่อยู่</Link>
        </div>
        {savedAddrs.length > 0 ? (
          <div className="space-y-2">
            {savedAddrs.map((a) => {
              const active = selectedAddrId === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => applySavedAddr(a)}
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-secondary/50"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 ${active ? "border-primary bg-primary" : "border-muted-foreground"}`}>
                      {active && <div className="h-full w-full rounded-full bg-primary-foreground scale-[0.4]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{a.label}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{a.address}</p>
                      {a.phone_primary && (
                        <p className="text-xs text-muted-foreground mt-0.5">โทร: {a.phone_primary}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            ยังไม่มีที่อยู่บันทึกไว้ — <Link to="/home" className="text-primary underline">เพิ่มที่อยู่จัดส่ง</Link>
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="notes">หมายเหตุถึงร้าน / ไรเดอร์</Label>
          <Textarea id="notes" placeholder="เช่น ไม่ใส่ผัก เผ็ดน้อย" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <Label htmlFor="promo">โค้ดส่วนลด</Label>
        <div className="flex gap-2">
          <Input id="promo" placeholder="เช่น WELCOME10" value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} disabled={!!promo} />
          {promo ? (
            <Button variant="outline" onClick={() => { setPromo(null); setPromoCode(""); }}>ลบ</Button>
          ) : (
            <Button variant="outline" onClick={applyPromo} disabled={checking}>{checking ? "..." : "ใช้"}</Button>
          )}
        </div>
        {promo && <p className="text-xs text-green-600">✓ ใช้ {promo.code} ลด ฿{promo.discount}</p>}
      </Card>

      <Card className="p-4 space-y-3">
        <div>
          <h2 className="font-semibold">วิธีชำระเงิน</h2>
          <p className="text-xs text-muted-foreground">
            ชำระค่าอาหารผ่าน PromptPay QR ก่อนร้านเริ่มทำ ค่าส่งจ่ายไรเดอร์ตอนรับของ
          </p>
        </div>
        <div className="p-3 rounded-lg border border-primary bg-primary/5 flex items-center gap-3">
          <QrCode className="h-5 w-5 text-primary shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-sm">PromptPay QR (ค่าอาหาร)</p>
            <p className="text-xs text-muted-foreground">
              ร้านยืนยันความพร้อม → ลูกค้าสแกนจ่าย → ร้านตรวจสลิป → เริ่มทำอาหาร
            </p>
            {restaurantHasPromptpay === false && (
              <p className="text-xs text-destructive mt-1">
                ร้านยังไม่ได้ตั้งค่า PromptPay จึงรับออเดอร์ไม่ได้ในขณะนี้
              </p>
            )}
          </div>
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
        {discount > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>ส่วนลด</span>
            <span>-฿{discount.toFixed(0)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold text-lg pt-2 border-t border-border">
          <span>รวมทั้งหมด</span>
          <span className="text-primary">฿{(total + deliveryFee - discount).toFixed(0)}</span>
        </div>
      </Card>

      <div className="fixed bottom-20 inset-x-0 px-4 z-30">
        <div className="max-w-2xl mx-auto">
          <Button size="lg" className="w-full shadow-lg" onClick={handleCheckout} disabled={submitting}>
            {submitting
              ? "กำลังสั่ง..."
              : paymentMethod === "promptpay_qr"
                ? `เสนอออเดอร์ — ฿${(total + deliveryFee - discount).toFixed(0)}`
                : `สั่งเลย — ฿${(total + deliveryFee - discount).toFixed(0)} (เงินสดปลายทาง)`}
          </Button>
        </div>
      </div>
    </main>
  );
}
