import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
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
  order_items: OrderItem[];
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "ใหม่",
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
  { key: "new", label: "ใหม่", statuses: ["pending"] },
  { key: "cooking", label: "กำลังทำ", statuses: ["accepted", "preparing"] },
  { key: "ready", label: "พร้อมส่ง", statuses: ["ready"] },
  { key: "delivering", label: "กำลังส่ง", statuses: ["picked_up", "delivering"] },
  { key: "done", label: "เสร็จแล้ว", statuses: ["delivered"] },
  { key: "cancelled", label: "ยกเลิก", statuses: ["cancelled"] },
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
    if (typeof window === "undefined") return "kitchen";
    const saved = localStorage.getItem("rest-sound-type") as SoundId | null;
    return saved && SOUND_OPTIONS.some((s) => s.id === saved) ? saved : "kitchen";
  });
  const [volume, setVolume] = useState<VolumeLevel>(() => {
    if (typeof window === "undefined") return "loud";
    const saved = localStorage.getItem("rest-sound-volume") as VolumeLevel | null;
    return saved && VOLUME_OPTIONS.some((v) => v.id === saved) ? saved : "loud";
  });
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initRef = useRef(false);

  async function load(rid: string) {
    const { data, error } = await supabase
      .from("orders")
      .select("id, status, total, subtotal, delivery_fee, delivery_address, notes, created_at, customer_id, order_items(id, name, price, quantity, notes)")
      .eq("restaurant_id", rid)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      toast.error(error.message);
      return;
    }
    const list = (data ?? []) as unknown as Order[];

    if (initRef.current) {
      const newPending = list.filter(
        (o) => o.status === "pending" && !knownIdsRef.current.has(o.id),
      );
      if (newPending.length > 0) {
        if (soundOn) playNotificationSound(soundType, volume);
        toast.success(`มีออเดอร์ใหม่ ${newPending.length} รายการ!`);
      }
    }
    knownIdsRef.current = new Set(list.map((o) => o.id));
    initRef.current = true;
    setOrders(list);
    setLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data: r } = await supabase
        .from("restaurants")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (!active) return;
      if (!r) {
        setLoading(false);
        return;
      }
      setRestaurantId(r.id);
      await load(r.id);
      const ch = supabase
        .channel(`rest-orders-${r.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${r.id}` },
          () => load(r.id),
        )
        .subscribe();
      return () => { supabase.removeChannel(ch); };
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function toggleSound(on: boolean) {
    setSoundOn(on);
    localStorage.setItem("rest-sound", on ? "on" : "off");
    if (on) playNotificationSound(soundType, volume);
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
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm"><Link to="/my-restaurant"><ArrowLeft className="h-4 w-4 mr-1" />หน้าร้าน</Link></Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              {soundOn ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-sm">เสียงแจ้งเตือน</span>
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
                <p className="text-sm font-medium">เลือกเสียง</p>
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

      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">ออเดอร์ Real-time</h1>
        {counts.new > 0 && <Badge className="ml-2">{counts.new} ใหม่</Badge>}
      </div>

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
