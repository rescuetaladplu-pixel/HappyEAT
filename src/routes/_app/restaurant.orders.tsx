import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchActiveRestaurantId } from "@/lib/active-restaurant";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Volume2, VolumeX, Bell, Play } from "lucide-react";
import { toast } from "sonner";
import { EnablePushButton } from "@/components/EnablePushButton";
import {
  playNotificationSound,
  SOUND_OPTIONS,
  VOLUME_OPTIONS,
  type SoundId,
  type VolumeLevel,
} from "@/lib/notification-sounds";

export const Route = createFileRoute("/_app/restaurant/orders")({
  component: RestaurantOrdersPage,
});

type OrderStatus =
  | "pending"
  | "awaiting_restaurant"
  | "awaiting_payment"
  | "awaiting_payment_confirm"
  | "payment_rejected"
  | "accepted"
  | "preparing"
  | "ready"
  | "picked_up"
  | "delivering"
  | "delivered"
  | "cancelled";

interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  notes: string | null;
}
interface Order {
  id: string;
  status: OrderStatus;
  total: number;
  subtotal: number;
  delivery_fee: number;
  delivery_address: string;
  notes: string | null;
  created_at: string;
  customer_id: string;
  payment_method: string;
  payment_slip_url: string | null;
  order_items: OrderItem[];
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "ใหม่",
  awaiting_restaurant: "รอรับ (QR)",
  awaiting_payment: "รอลูกค้าจ่าย",
  awaiting_payment_confirm: "รอตรวจสลิป",
  payment_rejected: "สลิปถูกปฏิเสธ",
  accepted: "รับแล้ว",
  preparing: "กำลังปรุง",
  ready: "พร้อมส่ง",
  picked_up: "ไรเดอร์รับ",
  delivering: "กำลังส่ง",
  delivered: "สำเร็จ",
  cancelled: "ยกเลิก",
};

const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: "accepted",
  accepted: "preparing",
  preparing: "ready",
};

const TABS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "new", label: "ใหม่", statuses: ["pending", "awaiting_restaurant"] },
  { key: "payment", label: "รอจ่าย/ตรวจสลิป", statuses: ["awaiting_payment", "awaiting_payment_confirm"] },
  { key: "cooking", label: "กำลังทำ", statuses: ["accepted", "preparing"] },
  { key: "ready", label: "พร้อมส่ง", statuses: ["ready"] },
  { key: "delivering", label: "กำลังส่ง", statuses: ["picked_up", "delivering"] },
  { key: "done", label: "เสร็จแล้ว", statuses: ["delivered"] },
  { key: "cancelled", label: "ยกเลิก/ปฏิเสธ", statuses: ["cancelled", "payment_rejected"] },
];

function RestaurantOrdersPage() {
  const { user } = useAuth();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("rest-sound") !== "off";
  });
  const [soundType, setSoundType] = useState<SoundId>(() => {
    if (typeof window === "undefined") return "emergency";
    const saved = localStorage.getItem("rest-sound-type") as SoundId | null;
    return saved && SOUND_OPTIONS.some((s) => s.id === saved) ? saved : "emergency";
  });
  const [volume, setVolume] = useState<VolumeLevel>(() => {
    if (typeof window === "undefined") return "normal";
    const saved = localStorage.getItem("rest-sound-volume") as VolumeLevel | null;
    return saved && VOLUME_OPTIONS.some((v) => v.id === saved) ? saved : "normal";
  });
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initRef = useRef(false);
  const alertIntervalRef = useRef<number | null>(null);
  const mutedUntilActionRef = useRef(false);
  const [alerting, setAlerting] = useState(false);
  // Keep latest values for the interval callback without re-creating it
  const soundOnRef = useRef(soundOn);
  const soundTypeRef = useRef(soundType);
  const volumeRef = useRef(volume);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);
  useEffect(() => { soundTypeRef.current = soundType; }, [soundType]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  function stopAlertLoop() {
    if (alertIntervalRef.current !== null) {
      window.clearInterval(alertIntervalRef.current);
      alertIntervalRef.current = null;
    }
    setAlerting(false);
  }
  function startAlertLoop() {
    if (alertIntervalRef.current !== null) return;
    if (!soundOnRef.current) return;
    playNotificationSound(soundTypeRef.current, volumeRef.current);
    alertIntervalRef.current = window.setInterval(() => {
      if (!soundOnRef.current) {
        stopAlertLoop();
        return;
      }
      playNotificationSound(soundTypeRef.current, volumeRef.current);
    }, 3000);
    setAlerting(true);
  }

  async function load(rid: string) {
    const { data, error } = await supabase
      .from("orders")
      .select("id, status, total, subtotal, delivery_fee, delivery_address, notes, created_at, customer_id, payment_method, payment_slip_url, order_items(id, name, price, quantity, notes)")
      .eq("restaurant_id", rid)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      toast.error(error.message);
      return;
    }
    const list = (data ?? []) as unknown as Order[];

    const pendingCount = list.filter((o) => o.status === "pending").length;

    if (initRef.current) {
      const newPending = list.filter(
        (o) => o.status === "pending" && !knownIdsRef.current.has(o.id),
      );
      if (newPending.length > 0) {
        toast.success(`มีออเดอร์ใหม่ ${newPending.length} รายการ!`);
        // New order arrives → un-mute and (re)start the loop
        mutedUntilActionRef.current = false;
        if (soundOnRef.current) startAlertLoop();
      }
    }
    knownIdsRef.current = new Set(list.map((o) => o.id));
    initRef.current = true;

    // Auto stop when no pending orders are left
    if (pendingCount === 0) {
      stopAlertLoop();
      mutedUntilActionRef.current = false;
    } else if (
      !mutedUntilActionRef.current &&
      soundOnRef.current &&
      alertIntervalRef.current === null
    ) {
      // Pending exists (e.g. on first load / refresh) → start looping
      startAlertLoop();
    }

    setOrders(list);
    setLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const rid = await fetchActiveRestaurantId(user.id);
      if (!active) return;
      if (!rid) {
        setLoading(false);
        return;
      }
      setRestaurantId(rid);
      await load(rid);
      if (!active) return;
      channel = supabase
        .channel(`rest-orders-${rid}-${Math.random().toString(36).slice(2, 8)}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${rid}` },
          () => load(rid),
        )
        .subscribe();
    })();
    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Stop the alert loop on unmount
  useEffect(() => {
    return () => stopAlertLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleSound(on: boolean) {
    setSoundOn(on);
    soundOnRef.current = on;
    localStorage.setItem("rest-sound", on ? "on" : "off");
    if (!on) {
      stopAlertLoop();
    } else {
      // If there are still pending orders, resume looping
      const hasPending = orders.some((o) => o.status === "pending");
      if (hasPending) {
        mutedUntilActionRef.current = false;
        startAlertLoop();
      } else {
        playNotificationSound(soundType, volume);
      }
    }
  }

  function muteUntilNextOrder() {
    mutedUntilActionRef.current = true;
    stopAlertLoop();
  }

  function selectSound(id: SoundId) {
    setSoundType(id);
    localStorage.setItem("rest-sound-type", id);
    playNotificationSound(id, volume);
  }

  function selectVolume(v: VolumeLevel) {
    setVolume(v);
    localStorage.setItem("rest-sound-volume", v);
    playNotificationSound(soundType, v);
  }

  async function setStatus(o: Order, status: OrderStatus) {
    const { error } = await supabase.from("orders").update({ status }).eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success(`อัปเดต: ${STATUS_LABELS[status]}`);
    // Fire-and-forget push notifications
    (async () => {
      try {
        const { sendStatusPush, notifyRidersOrderReady } = await import("@/lib/fcm.functions");
        if (status === "accepted") {
          await sendStatusPush({ data: { targetUserId: o.customer_id, title: "✅ ร้านรับออเดอร์แล้ว", body: "กำลังเตรียมทำอาหารให้คุณ", url: "/orders", tag: `order-${o.id}` } });
        } else if (status === "preparing") {
          await sendStatusPush({ data: { targetUserId: o.customer_id, title: "👨‍🍳 ร้านเริ่มทำอาหาร", body: "อีกสักครู่อาหารจะพร้อมส่ง", url: "/orders", tag: `order-${o.id}` } });
        } else if (status === "ready") {
          // Get restaurant info (name + pickup coords) for nearest-rider broadcast
          const { data: r } = await supabase
            .from("restaurants")
            .select("name, delivery_fee, latitude, longitude")
            .eq("id", restaurantId ?? "")
            .maybeSingle();
          await Promise.all([
            sendStatusPush({ data: { targetUserId: o.customer_id, title: "📦 อาหารพร้อมส่งแล้ว", body: "รอไรเดอร์มารับและจัดส่ง — เปิดแอปดูรหัส OTP", url: "/orders", tag: `order-${o.id}` } }),
            notifyRidersOrderReady({ data: {
              orderId: o.id,
              restaurantId: restaurantId ?? undefined,
              restaurantName: r?.name ?? undefined,
              restaurantLat: r?.latitude != null ? Number(r.latitude) : undefined,
              restaurantLng: r?.longitude != null ? Number(r.longitude) : undefined,
              deliveryFee: r?.delivery_fee ? Number(r.delivery_fee) : undefined,
            } }),
          ]);
        } else if (status === "cancelled") {
          await sendStatusPush({ data: { targetUserId: o.customer_id, title: "❌ ออเดอร์ถูกยกเลิก", body: "ร้านยกเลิกออเดอร์ของคุณ", url: "/orders", tag: `order-${o.id}` } });
        }
      } catch (e) { console.error("push failed", e); }
    })();
    if (restaurantId) load(restaurantId);
  }

  if (loading) {
    return <main className="max-w-3xl mx-auto p-4 space-y-3">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
    </main>;
  }

  if (!restaurantId) {
    return (
      <main className="max-w-2xl mx-auto p-6 text-center space-y-3">
        <p>ยังไม่มีร้าน</p>
        <Button asChild><Link to="/my-restaurant">ไปตั้งค่าร้าน</Link></Button>
      </main>
    );
  }

  const counts: Record<string, number> = {};
  for (const t of TABS) counts[t.key] = orders.filter((o) => t.statuses.includes(o.status)).length;

  return (
    <main className="max-w-3xl mx-auto p-4 pb-24 space-y-4">
      {alerting && (
        <div className="sticky top-2 z-30 flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 shadow-md animate-pulse">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Bell className="h-4 w-4" />
            กำลังเล่นเสียงแจ้งเตือนวนซ้ำ — มีออเดอร์ใหม่รอรับ
          </div>
          <Button size="sm" variant="outline" onClick={muteUntilNextOrder}>
            หยุดเสียงชั่วคราว
          </Button>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button asChild variant="ghost" size="sm"><Link to="/my-restaurant"><ArrowLeft className="h-4 w-4 mr-1" />หน้าร้าน</Link></Button>
        <div className="flex items-center gap-2 flex-wrap">
          <EnablePushButton restaurantId={restaurantId} />
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={soundOn ? "default" : "outline"}
              size="sm"
              className="gap-2 shadow-sm"
            >
              {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              <span className="text-sm font-medium">ตั้งค่าเสียงแจ้งเตือน</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">เปิดเสียงแจ้งเตือน</p>
                  <p className="text-xs text-muted-foreground">
                    เล่นเสียงเมื่อมีออเดอร์ใหม่
                  </p>
                </div>
                <Switch checked={soundOn} onCheckedChange={toggleSound} />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">ระดับความดัง</p>
                <div className="grid grid-cols-3 gap-1">
                  {VOLUME_OPTIONS.map((v) => (
                    <Button
                      key={v.id}
                      type="button"
                      size="sm"
                      variant={volume === v.id ? "default" : "outline"}
                      onClick={() => selectVolume(v.id)}
                    >
                      {v.label}
                    </Button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  ดังสุด = ขยายเสียงด้วยตัวบีบสัญญาณ (compressor) เพิ่มเป็น 3 เท่า
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">เลือกเสียง</p>
                <RadioGroup
                  value={soundType}
                  onValueChange={(v) => selectSound(v as SoundId)}
                  className="space-y-1"
                >
                  {SOUND_OPTIONS.map((opt) => (
                    <div
                      key={opt.id}
                      className="flex items-center gap-2 rounded-md border p-2"
                    >
                      <RadioGroupItem value={opt.id} id={`snd-${opt.id}`} />
                      <Label
                        htmlFor={`snd-${opt.id}`}
                        className="flex-1 cursor-pointer"
                      >
                        <div className="text-sm font-medium">{opt.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {opt.description}
                        </div>
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          playNotificationSound(opt.id, volume);
                        }}
                      >
                        <Play className="h-3 w-3 mr-1" />
                        ฟัง
                      </Button>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">ออเดอร์ Real-time</h1>
        {counts.new > 0 && <Badge className="ml-2">{counts.new} ใหม่</Badge>}
      </div>

      <Card className="p-3 bg-primary/5 border-primary/30 space-y-2">
        <p className="text-sm font-semibold text-primary">ℹ️ ขั้นตอนการรับออเดอร์</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          แท็บ <span className="font-medium text-foreground">"ใหม่"</span> เป็นเพียงการให้ร้านตรวจสอบรายการเพื่อ
          <span className="font-medium text-foreground">ยืนยันความพร้อม</span> เท่านั้น —
          ลูกค้ายัง<span className="font-medium text-foreground">ไม่ได้ชำระเงิน</span> จนกว่าร้านจะกดรับ
        </p>
        <ol className="text-xs space-y-1 list-decimal list-inside text-foreground/80">
          <li><span className="font-medium">ใหม่</span> → ร้านตรวจรายการ แล้วกด <span className="text-primary font-medium">"รับออเดอร์ พร้อมทำ"</span> (ยังไม่เริ่มทำ)</li>
          <li><span className="font-medium">รอจ่าย/ตรวจสลิป</span> → ลูกค้าสแกน QR จ่ายค่าอาหาร แล้วส่งสลิปให้ร้านตรวจ</li>
          <li><span className="font-medium">กำลังทำ</span> → ร้านยืนยันรับเงินแล้ว เริ่มทำอาหารได้เลย</li>
          <li><span className="font-medium">พร้อมส่ง → กำลังส่ง → เสร็จแล้ว</span> → ไรเดอร์รับของและจัดส่ง</li>
        </ol>
      </Card>


      <Tabs defaultValue="new">
        <TabsList className="w-full overflow-x-auto flex justify-start">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="flex-1 min-w-fit">
              {t.label}{counts[t.key] > 0 && <span className="ml-1 text-xs">({counts[t.key]})</span>}
            </TabsTrigger>
          ))}
        </TabsList>

        {TABS.map((t) => {
          const list = orders.filter((o) => t.statuses.includes(o.status));
          return (
            <TabsContent key={t.key} value={t.key} className="space-y-3 mt-4">
              {list.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">ไม่มีออเดอร์ในหมวดนี้</p>
              ) : (
                list.map((o) => (
                  <Card key={o.id} className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">#{o.id.slice(0, 8)}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(o.created_at).toLocaleString("th-TH")}
                        </p>
                      </div>
                      <Badge variant={o.status === "pending" ? "default" : "secondary"}>
                        {STATUS_LABELS[o.status]}
                      </Badge>
                    </div>

                    <div className="space-y-1 text-sm">
                      {o.order_items?.map((it) => (
                        <div key={it.id}>
                          <div className="flex justify-between">
                            <span>{it.quantity}× {it.name}</span>
                            <span>฿{(Number(it.price) * it.quantity).toFixed(0)}</span>
                          </div>
                          {it.notes && <p className="text-xs text-muted-foreground pl-3 italic">{it.notes}</p>}
                        </div>
                      ))}
                    </div>

                    <div className="border-t pt-2 text-sm space-y-1">
                      <p className="text-muted-foreground">📍 {o.delivery_address}</p>
                      {o.notes && <p className="text-xs italic text-muted-foreground">หมายเหตุ: {o.notes}</p>}
                      <div className="flex justify-between font-semibold pt-1">
                        <span>รวม</span>
                        <span className="text-primary">฿{Number(o.total).toFixed(0)}</span>
                      </div>
                    </div>

                    <QrFlowActions order={o} onChanged={() => restaurantId && load(restaurantId)} />
                    <div className="flex gap-2">
                      {NEXT[o.status] && (
                        <Button className="flex-1" onClick={() => setStatus(o, NEXT[o.status]!)}>
                          → {STATUS_LABELS[NEXT[o.status]!]}
                        </Button>
                      )}
                      {(o.status === "pending" || o.status === "accepted") && (
                        <Button variant="outline" className="text-destructive" onClick={() => setStatus(o, "cancelled")}>
                          ปฏิเสธ
                        </Button>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </main>
  );
}

function QrFlowActions({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const [slipUrl, setSlipUrl] = useState<string | null>(null);
  const [slipError, setSlipError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (order.status === "awaiting_payment_confirm" && order.payment_slip_url) {
      setSlipUrl(null);
      setSlipError(null);
      supabase.storage
        .from("payment-slips")
        .createSignedUrl(order.payment_slip_url, 300)
        .then(({ data, error }) => {
          if (error || !data?.signedUrl) {
            console.error("[slip] createSignedUrl failed", error);
            setSlipError(error?.message ?? "โหลดสลิปไม่สำเร็จ");
          } else {
            setSlipUrl(data.signedUrl);
          }
        });
    }
  }, [order.status, order.payment_slip_url]);

  async function notify(title: string, body: string) {
    try {
      const { sendStatusPush } = await import("@/lib/fcm.functions");
      await sendStatusPush({
        data: {
          targetUserId: order.customer_id,
          title,
          body,
          url: "/orders",
          tag: `order-${order.id}`,
        },
      });
    } catch (e) {
      console.error(e);
    }
  }

  async function acceptOrder() {
    setBusy(true);
    const { error } = await supabase
      .from("orders")
      .update({ status: "awaiting_payment", restaurant_accepted_at: new Date().toISOString() })
      .eq("id", order.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("รับออเดอร์แล้ว รอลูกค้าจ่าย");
    notify("✅ ร้านรับออเดอร์", `กรุณาสแกน QR ชำระเงิน ฿${Number(order.subtotal).toFixed(0)}`);
    onChanged();
  }

  async function rejectOrder() {
    setBusy(true);
    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled", rejection_reason: reason || "ร้านไม่สามารถรับออเดอร์ได้" })
      .eq("id", order.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("ปฏิเสธออเดอร์แล้ว");
    notify("❌ ร้านปฏิเสธออเดอร์", reason || "ร้านไม่สามารถรับออเดอร์ได้");
    onChanged();
  }

  async function confirmSlip() {
    setBusy(true);
    const { error } = await supabase
      .from("orders")
      .update({ status: "preparing", payment_confirmed_at: new Date().toISOString() })
      .eq("id", order.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("ยืนยันรับเงิน เริ่มทำอาหาร");
    notify("💚 ร้านยืนยันรับเงิน", "กำลังจัดทำอาหารของคุณ");
    onChanged();
  }

  async function rejectSlip() {
    setBusy(true);
    const { error } = await supabase
      .from("orders")
      .update({ status: "payment_rejected", rejection_reason: reason || "สลิปไม่ตรง / ยอดไม่ถูกต้อง" })
      .eq("id", order.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("ปฏิเสธสลิปแล้ว");
    notify("⚠️ สลิปไม่ผ่าน", reason || "กรุณาตรวจสอบและส่งสลิปใหม่");
    onChanged();
  }

  if (order.status === "awaiting_restaurant") {
    return (
      <div className="space-y-2 border rounded p-2 bg-secondary/30">
        <p className="text-xs font-medium">📋 ลูกค้าเสนอออเดอร์ (จ่ายด้วย QR) — ตรวจรายการแล้วกดรับ</p>
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={acceptOrder}>
            ✅ รับออเดอร์ พร้อมทำ
          </Button>
          <Button variant="outline" className="text-destructive" disabled={busy} onClick={rejectOrder}>
            ปฏิเสธ
          </Button>
        </div>
      </div>
    );
  }

  if (order.status === "awaiting_payment") {
    return (
      <p className="text-xs text-center bg-secondary/50 rounded p-2">
        ⏳ รอลูกค้าสแกน QR ชำระเงิน ฿{Number(order.subtotal).toFixed(0)} แล้วส่งสลิป
      </p>
    );
  }

  if (order.status === "awaiting_payment_confirm") {
    return (
      <div className="space-y-2 border-2 border-primary rounded p-2 bg-primary/5">
        <p className="text-xs font-medium">💰 ลูกค้าส่งสลิปแล้ว — ตรวจในแอปธนาคารแล้วยืนยัน</p>
        {slipUrl ? (
          <a href={slipUrl} target="_blank" rel="noreferrer" className="block">
            <img src={slipUrl} alt="slip" className="max-h-72 w-full object-contain rounded border bg-white" />
          </a>
        ) : slipError ? (
          <p className="text-xs text-destructive bg-destructive/10 rounded p-2">โหลดสลิปไม่สำเร็จ: {slipError}</p>
        ) : (
          <Loader2InlineLoader />
        )}
        <p className="text-xs text-muted-foreground">
          ยอดที่ต้องเข้าบัญชี: <strong className="text-primary">฿{Number(order.subtotal).toFixed(2)}</strong>
        </p>
        <input
          placeholder="เหตุผลปฏิเสธ (ถ้ามี)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full text-xs border rounded px-2 py-1"
          maxLength={200}
        />
        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={confirmSlip}>
            ✅ ยืนยันรับเงิน เริ่มทำอาหารทันที
          </Button>
          <Button variant="outline" className="text-destructive" disabled={busy} onClick={rejectSlip}>
            ❌ ปฏิเสธสลิป
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

function Loader2InlineLoader() {
  return <div className="flex justify-center py-4 text-xs text-muted-foreground">กำลังโหลดสลิป...</div>;
}
