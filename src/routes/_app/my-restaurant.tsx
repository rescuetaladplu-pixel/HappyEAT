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
  Truck,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

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

  // group by time signature
  const groups = new Map<string, DayKey[]>();
  for (const d of openDays) {
    const key = `${oh[d].open}-${oh[d].close}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(d);
  }

  // all 7 days same time
  if (openDays.length === 7 && groups.size === 1) {
    const [time] = [...groups.keys()];
    const [open, close] = time.split("-");
    return [`เปิดทุกวัน ${open} - ${close}`];
  }

  const formatDays = (days: DayKey[]): string => {
    // Mon-Fri shortcut
    const isWeekdays = days.length === 5 && ["mon","tue","wed","thu","fri"].every(d => days.includes(d as DayKey));
    if (isWeekdays) return "จ.-ศ.";
    const isWeekend = days.length === 2 && days.includes("sat") && days.includes("sun");
    if (isWeekend) return "ส.-อา.";
    // Detect contiguous range in WEEK_ORDER
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
  is_approved: boolean;
  delivery_fee: number;
  rating: number;
  opening_hours: OpeningHours;
}

function MyRestaurantHub() {
  const { user, role } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);

  // Create form (first-time)
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!user) return;
    const { data } = await supabase
      .from("restaurants")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();
    setRestaurant((data as unknown as Restaurant | null) ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function createRestaurant() {
    if (!user || !name) return toast.error("กรุณากรอกชื่อร้าน");
    setSaving(true);
    const { error } = await supabase.from("restaurants").insert({
      owner_id: user.id, name, description, category, phone, is_approved: true,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("สร้างร้านสำเร็จ");
    load();
  }

  async function toggleOpen(open: boolean) {
    if (!restaurant) return;
    await supabase.from("restaurants").update({ is_open: open }).eq("id", restaurant.id);
    setRestaurant({ ...restaurant, is_open: open });
    toast.success(open ? "เปิดร้านแล้ว" : "ปิดร้านชั่วคราว");
  }

  if (loading) {
    return (
      <main className="p-6 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  if (role !== "restaurant" && role !== "admin" && !restaurant) {
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

  if (!restaurant) {
    return (
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-bold">สร้างร้านอาหาร</h1>
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

  const hoursSummary = summarizeOpeningHours(restaurant.opening_hours);

  const menuItems = [
    { to: "/my-restaurant/settings", icon: Settings, label: "จัดการข้อมูลร้านค้า", desc: "โปรไฟล์ ที่อยู่ เวลาทำการ" },
    { to: "/restaurant/menu", icon: ChefHat, label: "จัดการเมนูอาหาร", desc: "หมวดหมู่ เมนู ตัวเลือกเสริม" },
    { to: "/restaurant/orders", icon: Bell, label: "ออเดอร์คำสั่งซื้อ", desc: "รับออเดอร์ Real-time" },
    { to: "/restaurant/analytics", icon: TrendingUp, label: "ข้อมูลยอดขาย", desc: "สรุปรายวัน / รายเดือน" },
    { to: "/restaurant/promotions", icon: Tag, label: "โปรโมชั่น", desc: "ส่วนลด โค้ดคูปอง" },
    { to: "/restaurant/reviews", icon: MessageSquare, label: "รีวิวลูกค้า", desc: "อ่านและตอบกลับรีวิว" },
  ] as const;

  return (
    <main className="max-w-2xl mx-auto pb-4 space-y-4">
      {/* Overview Card */}
      <Card className="overflow-hidden p-0">
        <div className="relative h-40 w-full bg-muted">
          {restaurant.cover_url ? (
            <img src={restaurant.cover_url} alt="cover" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
              ยังไม่มีภาพหน้าปก
            </div>
          )}
        </div>

        <div className="px-4 pb-4">
          <div className="flex items-start gap-3 -mt-10">
            <div className="h-20 w-20 rounded-full border-4 border-card bg-muted overflow-hidden flex items-center justify-center shrink-0">
              {restaurant.logo_url ? (
                <img src={restaurant.logo_url} alt="logo" className="w-full h-full object-cover" />
              ) : (
                <Store className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
          </div>

          <div className="mt-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{restaurant.name}</h1>
              {restaurant.is_approved ? (
                <Badge variant="secondary" className="text-[10px]">อนุมัติแล้ว</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">รออนุมัติ</Badge>
              )}
            </div>
            {restaurant.category && (
              <p className="text-xs text-muted-foreground mt-0.5">{restaurant.category}</p>
            )}
          </div>

          {/* Online status bar */}
          <div
            className={`mt-3 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors ${
              restaurant.is_open
                ? "bg-green-500/10 border-green-500/30"
                : "bg-muted border-border"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="relative flex h-3 w-3 shrink-0">
                {restaurant.is_open && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />
                )}
                <span
                  className={`relative inline-flex h-3 w-3 rounded-full ${
                    restaurant.is_open ? "bg-green-500" : "bg-muted-foreground"
                  }`}
                />
              </span>
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${restaurant.is_open ? "text-green-700 dark:text-green-400" : "text-muted-foreground"}`}>
                  {restaurant.is_open ? "ออนไลน์ – พร้อมรับออเดอร์" : "ออฟไลน์ – ปิดรับออเดอร์"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {restaurant.is_open ? "ลูกค้าสามารถสั่งอาหารจากร้านคุณได้" : "ลูกค้าจะสั่งอาหารจากร้านคุณไม่ได้ชั่วคราว"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-medium text-muted-foreground">เปิดร้าน</span>
              <Switch checked={restaurant.is_open} onCheckedChange={toggleOpen} />
            </div>
          </div>

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
            <div className="flex items-center gap-2 text-muted-foreground">
              <Truck className="h-4 w-4 shrink-0" />
              <span>ค่าส่ง ฿{Number(restaurant.delivery_fee).toFixed(0)}</span>
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
