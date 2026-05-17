import { createFileRoute, Link } from "@tanstack/react-router";
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
import {
  Store,
  Loader2,
  Settings,
  ChefHat,
  Bell,
  TrendingUp,
  Tag,
  MessageSquare,
  MapPin,
  Phone,
  Clock,
  Star,
  ChevronRight,
  Utensils,
  Volume2,
  Plus,
  Check,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { isOpenNow, nextOpenLabel, nextCloseAt, formatCloseLabel } from "@/lib/opening-hours";
import { useOwnedRestaurants, setActiveRestaurantId } from "@/lib/active-restaurant";

export const Route = createFileRoute("/_app/my-restaurant")({
  component: MyRestaurantHub,
});

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const DAY_SHORT: Record<DayKey, string> = {
  mon: "จ.", tue: "อ.", wed: "พ.", thu: "พฤ.", fri: "ศ.", sat: "ส.", sun: "อา.",
};
const WEEK_ORDER: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

interface OpeningHours {
  [k: string]: { open: string; close: string; closed: boolean };
}

function summarizeOpeningHours(oh: OpeningHours | null | undefined): string[] {
  if (!oh) return ["ยังไม่ได้ตั้งเวลาทำการ"];
  const openDays = WEEK_ORDER.filter((d) => oh[d] && !oh[d].closed);
  if (openDays.length === 0) return ["ยังไม่ได้ตั้งเวลาทำการ"];

  const groups = new Map<string, DayKey[]>();
  for (const d of openDays) {
    const key = `${oh[d].open}-${oh[d].close}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }

  if (openDays.length === 7 && groups.size === 1) {
    const [time] = [...groups.keys()];
    const [open, close] = time.split("-");
    return [`เปิดทุกวัน ${open} - ${close}`];
  }

  const formatDays = (days: DayKey[]): string => {
    const isWeekdays = days.length === 5 && ["mon","tue","wed","thu","fri"].every(d => days.includes(d as DayKey));
    if (isWeekdays) return "จ.-ศ.";
    const isWeekend = days.length === 2 && days.includes("sat") && days.includes("sun");
    if (isWeekend) return "ส.-อา.";
    const idx = days.map(d => WEEK_ORDER.indexOf(d)).sort((a,b)=>a-b);
    const contiguous = idx.every((v,i) => i === 0 || v === idx[i-1] + 1);
    if (contiguous && days.length >= 3) {
      return `${DAY_SHORT[WEEK_ORDER[idx[0]]]}-${DAY_SHORT[WEEK_ORDER[idx[idx.length-1]]]}`;
    }
    return days.map(d => DAY_SHORT[d]).join(", ");
  };

  return [...groups.entries()].map(([time, days]) => {
    const [open, close] = time.split("-");
    return `${formatDays(days)} ${open} - ${close}`;
  });
}

interface Restaurant {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  cover_url: string | null;
  is_open: boolean;
  is_open_until: string | null;
  is_approved: boolean;
  delivery_fee: number;
  rating: number;
  opening_hours: OpeningHours;
  promptpay_id: string | null;
  promptpay_qr_url: string | null;
}

function MyRestaurantHub() {
  const { user, role, roles } = useAuth();
  const { restaurants: owned, activeId, loading: ownedLoading, selectRestaurant, reload } = useOwnedRestaurants();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Picker view toggle (default true if multiple restaurants)
  const [showPicker, setShowPicker] = useState(false);

  // Pending order counts per restaurant (active = not delivered/cancelled)
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (owned.length === 0) {
      setPendingCounts({});
      return;
    }
    const ids = owned.map((r) => r.id);
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("orders")
        .select("restaurant_id, status")
        .in("restaurant_id", ids)
        .not("status", "in", "(delivered,cancelled)");
      if (cancelled) return;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as { restaurant_id: string }[]) {
        counts[row.restaurant_id] = (counts[row.restaurant_id] ?? 0) + 1;
      }
      setPendingCounts(counts);
    }
    load();
    const ch = supabase
      .channel("my-rest-pending")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [owned]);

  // Create form
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadDetail(id: string) {
    setLoadingDetail(true);
    const { data } = await supabase
      .from("restaurants")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    const r = (data as unknown as Restaurant | null) ?? null;
    if (r) {
      const hasPayment = !!r.promptpay_id || !!r.promptpay_qr_url;
      // ออฟไลน์อัตโนมัติถ้ายังไม่ตั้งค่าการรับชำระเงิน
      if (r.is_open && !hasPayment) {
        await supabase.from("restaurants").update({ is_open: false, is_open_until: null }).eq("id", r.id);
        r.is_open = false;
        r.is_open_until = null;
      } else if (r.is_open && !isOpenNow(r.opening_hours)) {
        const extendActive = r.is_open_until && new Date(r.is_open_until) > new Date();
        if (!extendActive) {
          await supabase.from("restaurants").update({ is_open: false, is_open_until: null }).eq("id", r.id);
          r.is_open = false;
          r.is_open_until = null;
        }
      }
    }
    setRestaurant(r);
    setLoadingDetail(false);
  }

  useEffect(() => {
    if (activeId) loadDetail(activeId);
    else setRestaurant(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  async function createRestaurant() {
    if (!user || !name) return toast.error("กรุณากรอกชื่อร้าน");
    setSaving(true);
    const { data, error } = await supabase
      .from("restaurants")
      .insert({ owner_id: user.id, name, description, category, phone, is_approved: true })
      .select("id")
      .maybeSingle();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("สร้างร้านสำเร็จ");
    if (data?.id) {
      setActiveRestaurantId(data.id);
      selectRestaurant(data.id);
    }
    setCreating(false);
    setName(""); setDescription(""); setCategory(""); setPhone("");
    reload();
  }

  async function toggleOpen(open: boolean) {
    if (!restaurant) return;
    if (!open) {
      await supabase.from("restaurants").update({ is_open: false, is_open_until: null }).eq("id", restaurant.id);
      setRestaurant({ ...restaurant, is_open: false, is_open_until: null });
      toast.success("ปิดร้านชั่วคราว");
      return;
    }
    const hasPayment = !!restaurant.promptpay_id || !!restaurant.promptpay_qr_url;
    if (!hasPayment) {
      toast.error("ยังเปิดร้านไม่ได้", {
        description: "กรุณาตั้งค่าการรับชำระเงิน (PromptPay หรือ QR ของร้าน) ก่อนเปิดรับออเดอร์",
        duration: 6000,
      });
      return;
    }
    const closeAt = nextCloseAt(restaurant.opening_hours);
    const closeIso = closeAt ? closeAt.toISOString() : null;
    await supabase.from("restaurants").update({ is_open: true, is_open_until: closeIso }).eq("id", restaurant.id);
    setRestaurant({ ...restaurant, is_open: true, is_open_until: closeIso });
    const withinHours = isOpenNow(restaurant.opening_hours);
    if (!withinHours && closeAt) {
      toast.success("เปิดร้านนอกเวลาทำการ", {
        description: `ร้านจะออนไลน์ยาวจนถึงเวลาปิดอัตโนมัติ: ${formatCloseLabel(closeAt)}`,
        duration: 6000,
      });
    } else {
      toast.success("เปิดร้านแล้ว");
    }
  }

  // ============ Loading ============
  if (ownedLoading) {
    return (
      <main className="p-6 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  // ============ Permission ============
  const canOwn = role === "admin" || roles.includes("restaurant") || roles.includes("admin");
  if (!canOwn && owned.length === 0) {
    return (
      <main className="max-w-2xl mx-auto p-4">
        <Card className="p-6 text-center space-y-3">
          <p className="text-muted-foreground">หน้านี้สำหรับเจ้าของร้านอาหารเท่านั้น</p>
          <Button asChild variant="outline">
            <Link to="/profile">กลับไปหน้าโปรไฟล์</Link>
          </Button>
        </Card>
      </main>
    );
  }

  // ============ Create form (no restaurants yet, or user chose +new) ============
  if (owned.length === 0 || creating) {
    return (
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          {creating && owned.length > 0 && (
            <Button variant="ghost" size="icon" onClick={() => setCreating(false)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <h1 className="text-2xl font-bold">{owned.length === 0 ? "สร้างร้านอาหาร" : "เพิ่มร้านใหม่"}</h1>
        </div>
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
          <div className="space-y-2">
            <Label>เบอร์โทรศัพท์</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <Button onClick={createRestaurant} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Store className="h-4 w-4 mr-2" />}
            สร้างร้าน
          </Button>
        </Card>
      </main>
    );
  }

  // ============ Picker view ============
  if (showPicker) {
    return (
      <main className="max-w-2xl mx-auto p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setShowPicker(false)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">เลือกร้านที่จะจัดการ</h1>
        </div>
        <div className="space-y-2">
          {owned.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                selectRestaurant(r.id);
                setShowPicker(false);
              }}
              className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                r.id === activeId ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-accent"
              }`}
            >
              <div className="h-12 w-12 rounded-lg bg-muted overflow-hidden flex items-center justify-center shrink-0">
                {r.logo_url ? (
                  <img src={r.logo_url} alt={r.name} className="w-full h-full object-cover" />
                ) : (
                  <Store className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold truncate">{r.name}</p>
                  {!r.is_approved && <Badge variant="outline" className="text-[10px]">รออนุมัติ</Badge>}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {r.category ?? "-"} · {r.is_open ? "เปิดอยู่" : "ปิด"}
                </p>
                {pendingCounts[r.id] ? (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Badge className="text-[10px] h-5 px-1.5">
                      <Bell className="h-3 w-3 mr-1" />
                      ค้าง {pendingCounts[r.id]} ออเดอร์
                    </Badge>
                  </div>
                ) : null}
              </div>
              {r.id === activeId && <Check className="h-4 w-4 text-primary shrink-0" />}
            </button>
          ))}
        </div>
        <Button variant="outline" className="w-full" onClick={() => { setShowPicker(false); setCreating(true); }}>
          <Plus className="h-4 w-4 mr-2" /> เพิ่มร้านใหม่
        </Button>
      </main>
    );
  }

  // ============ Active restaurant hub ============
  if (loadingDetail || !restaurant) {
    return (
      <main className="p-6 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  const hoursSummary = summarizeOpeningHours(restaurant.opening_hours);

  const menuItems = [
    { to: "/my-restaurant/settings", icon: Settings, label: "จัดการข้อมูลร้านค้า", desc: "โปรไฟล์ ที่อยู่ เวลาทำการ" },
    { to: "/restaurant/menu", icon: ChefHat, label: "จัดการเมนูอาหาร", desc: "หมวดหมู่ เมนู ตัวเลือกเสริม" },
    { to: "/restaurant/orders", icon: Bell, label: "ออเดอร์คำสั่งซื้อ", desc: "รับออเดอร์ Real-time" },
    { to: "/restaurant/notification-settings", icon: Volume2, label: "ตั้งค่าเสียงแจ้งเตือน", desc: "เลือกเสียง ความดัง สำหรับออเดอร์ใหม่" },
    { to: "/restaurant/analytics", icon: TrendingUp, label: "ข้อมูลยอดขาย", desc: "สรุปรายวัน / รายเดือน" },
    { to: "/restaurant/promotions", icon: Tag, label: "โปรโมชั่น", desc: "ส่วนลด โค้ดคูปอง" },
    { to: "/restaurant/reviews", icon: MessageSquare, label: "รีวิวลูกค้า", desc: "อ่านและตอบกลับรีวิว" },
  ] as const;

  return (
    <main className="max-w-2xl mx-auto pb-4 space-y-4">
      {/* Restaurant switcher */}
      <div className="px-4 pt-3">
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-accent transition-colors"
        >
          <div className="h-10 w-10 rounded-lg bg-muted overflow-hidden flex items-center justify-center shrink-0">
            {restaurant.logo_url ? (
              <img src={restaurant.logo_url} alt={restaurant.name} className="w-full h-full object-cover" />
            ) : (
              <Store className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[11px] text-muted-foreground">ร้านที่กำลังจัดการ</p>
            <p className="font-semibold text-sm truncate">{restaurant.name}</p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
            {(() => {
              const totalPending = Object.values(pendingCounts).reduce((a, b) => a + b, 0);
              return totalPending > 0 ? (
                <Badge className="text-[10px] h-5 px-1.5">
                  <Bell className="h-3 w-3 mr-1" />
                  {totalPending}
                </Badge>
              ) : null;
            })()}
            {owned.length > 1 ? <span>{owned.length} ร้าน</span> : null}
            <ChevronRight className="h-4 w-4" />
          </div>
        </button>
      </div>

      {/* Overview Card */}
      <Card className="p-0 overflow-hidden mx-4">
        <div className="aspect-[3/1] w-full bg-muted">
          {restaurant.cover_url ? (
            <img src={restaurant.cover_url} alt="cover" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
              ยังไม่มีภาพหน้าปก
            </div>
          )}
        </div>

        <div className="px-4 pb-4 pt-4">
          <div className="flex items-start gap-3">
            <div className="h-20 w-20 rounded-full border-4 border-card bg-muted overflow-hidden flex items-center justify-center shrink-0 shadow-md">
              {restaurant.logo_url ? (
                <img src={restaurant.logo_url} alt="logo" className="w-full h-full object-cover" />
              ) : (
                <Store className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold">{restaurant.name}</h1>
                {restaurant.is_approved ? (
                  <Badge variant="secondary" className="text-[10px]">อนุมัติแล้ว</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">รออนุมัติ</Badge>
                )}
              </div>
              {restaurant.category && (
                <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                  <Utensils className="h-3.5 w-3.5 shrink-0" />
                  <span>ประเภทร้านอาหาร: <span className="font-medium text-foreground">{restaurant.category}</span></span>
                </div>
              )}
            </div>
          </div>

          {(() => {
            const withinHours = isOpenNow(restaurant.opening_hours);
            const extendUntil = restaurant.is_open_until ? new Date(restaurant.is_open_until) : null;
            const extendActive = !!(extendUntil && extendUntil > new Date());
            const reallyOpen = restaurant.is_open && (withinHours || extendActive);
            const nextLabel = nextOpenLabel(restaurant.opening_hours);
            const title = !restaurant.is_open
              ? "ออฟไลน์ – ปิดรับออเดอร์"
              : extendActive && !withinHours
                ? `ออนไลน์นอกเวลา – ปิดอัตโนมัติ ${formatCloseLabel(extendUntil!)}`
                : !withinHours
                  ? `นอกเวลาทำการ${nextLabel ? ` – ${nextLabel}` : ""}`
                  : "ออนไลน์ – พร้อมรับออเดอร์";
            const subtitle = !restaurant.is_open
              ? "ลูกค้าจะสั่งอาหารจากร้านคุณไม่ได้ชั่วคราว"
              : extendActive && !withinHours
                ? "คุณเปิดร้านนอกเวลาทำการ — ระบบจะปิดอัตโนมัติเมื่อถึงเวลาปิด"
                : !withinHours
                  ? "ร้านจะรับออเดอร์อัตโนมัติเมื่อถึงเวลาทำการ"
                  : "ลูกค้าสามารถสั่งอาหารจากร้านคุณได้";
            return (
              <div
                className={`mt-3 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${
                  reallyOpen ? "bg-green-500/10 border-green-500/30" : "bg-muted border-border"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="relative flex h-3 w-3 shrink-0">
                    {reallyOpen && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
                    )}
                    <span className={`relative inline-flex h-3 w-3 rounded-full ${reallyOpen ? "bg-green-500" : "bg-muted-foreground"}`} />
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${reallyOpen ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>
                      {title}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{subtitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-medium text-muted-foreground">เปิดร้าน</span>
                  <Switch checked={restaurant.is_open} onCheckedChange={toggleOpen} />
                </div>
              </div>
            );
          })()}

          {!restaurant.promptpay_id && !restaurant.promptpay_qr_url && (
            <Link
              to="/my-restaurant/settings"
              className="mt-3 flex items-start gap-3 rounded-xl border-2 border-destructive/40 bg-destructive/10 px-4 py-3 hover:bg-destructive/15 transition-colors"
            >
              <span className="text-xl shrink-0">⚠️</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-destructive">ยังเปิดร้านไม่ได้ — ต้องตั้งค่าการรับชำระเงินก่อน</p>
                <p className="text-xs text-destructive/80 mt-0.5">
                  เพิ่มเลข PromptPay หรืออัปโหลด QR ของร้าน เพื่อให้ลูกค้าโอนชำระค่าอาหารได้ → แตะที่นี่เพื่อตั้งค่า
                </p>
              </div>
            </Link>
          )}

          {restaurant.description && (
            <p className="text-sm text-muted-foreground mt-3">{restaurant.description}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4 text-sm">
            <div className="flex items-start gap-2 text-muted-foreground sm:col-span-2">
              <Clock className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                {hoursSummary.map((line, i) => (
                  <div key={i} className="truncate">{line}</div>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Star className="h-4 w-4 shrink-0 text-yellow-500" />
              <span>{Number(restaurant.rating).toFixed(1)} คะแนน</span>
            </div>
            {restaurant.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4 shrink-0" />
                <span className="truncate">{restaurant.phone}</span>
              </div>
            )}
            {restaurant.address && (
              <div className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="truncate">{restaurant.address}</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Menu hub */}
      <div className="px-4 space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground px-1">เมนูจัดการร้าน</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {menuItems.map((m) => (
            <Link
              key={m.to}
              to={m.to}
              className="group flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-accent transition-colors"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <m.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{m.label}</p>
                <p className="text-xs text-muted-foreground truncate">{m.desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
