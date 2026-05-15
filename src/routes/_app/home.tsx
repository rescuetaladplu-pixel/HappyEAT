import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import { LocationPicker } from "@/components/restaurant/LocationPicker";
import { Search, MapPin, Star, UtensilsCrossed, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/home")({
  component: HomePage,
});

interface Restaurant {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  image_url: string | null;
  cover_url: string | null;
  logo_url: string | null;
  rating: number;
  delivery_fee: number;
  is_open: boolean;
}

interface AddressRow {
  id: string;
  label: string;
  address: string;
  is_default: boolean;
  latitude: number | null;
  longitude: number | null;
  contact_name: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  rider_note: string | null;
}

const CATEGORIES = ["ทั้งหมด", "ตามสั่ง", "ก๋วยเตี๋ยว", "ส้มตำ", "เครื่องดื่ม", "ของหวาน", "ฟาสต์ฟู้ด"];
const PHONE_RE = /^[0-9+\-\s()]{8,20}$/;
const ADDRESS_SAVE_TIMEOUT_MS = 15000;

async function withTimeout<T>(promise: PromiseLike<T>, ms: number) {
  let timeoutId: number | undefined;
  try {
    return await Promise.race<T>([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error("timeout")), ms);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

function HomePage() {
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ทั้งหมด");

  // Address state
  const [addr, setAddr] = useState<AddressRow | null>(null);
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrLabel, setAddrLabel] = useState("บ้าน");
  const [addrText, setAddrText] = useState("");
  const [contactName, setContactName] = useState("");
  const [phonePrimary, setPhonePrimary] = useState("");
  const [phoneSecondary, setPhoneSecondary] = useState("");
  const [riderNote, setRiderNote] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [savingAddr, setSavingAddr] = useState(false);

  const loadRestaurants = useCallback(async () => {
    const { data } = await supabase
      .from("restaurants")
      .select("id, name, description, category, image_url, cover_url, logo_url, rating, delivery_fee, is_open")
      .eq("is_approved", true)
      .order("rating", { ascending: false });
    setRestaurants((data ?? []) as Restaurant[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRestaurants();
  }, [loadRestaurants]);

  useRefetchOnFocus(loadRestaurants);

  useEffect(() => {
    if (!user) return;
    async function loadAddr() {
      const { data } = await supabase
        .from("addresses")
        .select("id, label, address, is_default, latitude, longitude, contact_name, phone_primary, phone_secondary, rider_note")
        .eq("user_id", user!.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        const r = data as AddressRow;
        setAddr(r);
        setAddrLabel(r.label);
        setAddrText(r.address);
        setContactName(r.contact_name ?? "");
        setPhonePrimary(r.phone_primary ?? "");
        setPhoneSecondary(r.phone_secondary ?? "");
        setRiderNote(r.rider_note ?? "");
        setLat(r.latitude !== null ? Number(r.latitude) : null);
        setLng(r.longitude !== null ? Number(r.longitude) : null);
      }
    }
    loadAddr();
  }, [user]);

  function handleAddressOpen(nextOpen: boolean) {
    if (nextOpen && !authLoading && !user) {
      toast.error("กรุณาเข้าสู่ระบบก่อนบันทึกที่อยู่");
      navigate({ to: "/auth" });
      return;
    }
    setAddrOpen(nextOpen);
  }

  async function saveAddress() {
    if (!addrText.trim()) return toast.error("กรุณากรอกที่อยู่");
    if (!phonePrimary.trim()) return toast.error("กรุณากรอกเบอร์ติดต่อหลัก");
    if (!PHONE_RE.test(phonePrimary.trim())) return toast.error("รูปแบบเบอร์ติดต่อหลักไม่ถูกต้อง");
    if (phoneSecondary.trim() && !PHONE_RE.test(phoneSecondary.trim()))
      return toast.error("รูปแบบเบอร์ติดต่อสำรองไม่ถูกต้อง");
    setSavingAddr(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const activeUser = sessionData.session?.user ?? user;
    if (!activeUser) {
      setSavingAddr(false);
      toast.error("กรุณาเข้าสู่ระบบก่อนบันทึกที่อยู่");
      setAddrOpen(false);
      navigate({ to: "/auth" });
      return;
    }
    const payload = {
      user_id: activeUser.id,
      label: addrLabel.trim() || "บ้าน",
      address: addrText.trim(),
      is_default: true,
      latitude: lat,
      longitude: lng,
      contact_name: contactName.trim() || null,
      phone_primary: phonePrimary.trim(),
      phone_secondary: phoneSecondary.trim() || null,
      rider_note: riderNote.trim() || null,
    };
    try {
      const res = await withTimeout(
        addr
          ? supabase.from("addresses").update(payload).eq("id", addr.id).select().single()
          : supabase.from("addresses").insert(payload).select().single(),
        ADDRESS_SAVE_TIMEOUT_MS,
      );
      if (res.error) return toast.error(res.error.message);
      setAddr(res.data as AddressRow);
      setAddrOpen(false);
      toast.success("บันทึกที่อยู่แล้ว");
    } catch (error) {
      const message = error instanceof Error && error.message === "timeout"
        ? "บันทึกที่อยู่ไม่สำเร็จ: การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่"
        : "บันทึกที่อยู่ไม่สำเร็จ กรุณาลองใหม่";
      toast.error(message);
    } finally {
      setSavingAddr(false);
    }
  }

  const filtered = restaurants.filter((r) => {
    const okCat = category === "ทั้งหมด" || r.category === category;
    const okSearch = !search || r.name.toLowerCase().includes(search.toLowerCase());
    return okCat && okSearch;
  });

  if (role && role !== "customer") {
    const dest =
      role === "restaurant" ? "/restaurant-dashboard" : role === "rider" ? "/rider-dashboard" : "/admin";
    return (
      <main className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">ยินดีต้อนรับ</h1>
        <p className="text-muted-foreground mb-4">บัญชีนี้ไม่ใช่บัญชีลูกค้า</p>
        <Link to={dest} className="text-primary underline">ไปที่แดชบอร์ดของคุณ</Link>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto">
      <header className="px-4 pt-6 pb-4">
        <Sheet open={addrOpen} onOpenChange={handleAddressOpen}>
          <SheetTrigger asChild>
            <button className="flex items-center gap-2 mb-3 w-full text-left rounded-xl hover:bg-secondary/60 active:bg-secondary p-1 -m-1 transition">
              <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shrink-0">
                <UtensilsCrossed className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> ส่งไปยัง
                </p>
                <p className="text-sm font-semibold truncate">
                  {addr ? `${addr.label} · ${addr.address}` : "เพิ่มที่อยู่จัดส่ง"}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>ที่อยู่จัดส่ง</SheetTitle>
            </SheetHeader>
            <div className="space-y-3 py-4">
              <div className="space-y-2">
                <Label htmlFor="addr-label">ชื่อสถานที่</Label>
                <Input
                  id="addr-label"
                  placeholder="เช่น บ้าน, ที่ทำงาน"
                  maxLength={50}
                  value={addrLabel}
                  onChange={(e) => setAddrLabel(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addr-text">ที่อยู่</Label>
                <Textarea
                  id="addr-text"
                  placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด"
                  maxLength={500}
                  value={addrText}
                  onChange={(e) => setAddrText(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>ปักหมุดบนแผนที่ (คลิกเพื่อเลือกตำแหน่ง)</Label>
                <LocationPicker lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln); }} />
                {lat !== null && lng !== null && (
                  <p className="text-xs text-muted-foreground">
                    พิกัด: {lat.toFixed(5)}, {lng.toFixed(5)}
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => {
                    if (!navigator.geolocation) return toast.error("เบราว์เซอร์ไม่รองรับ GPS");
                    navigator.geolocation.getCurrentPosition(
                      (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); },
                      () => toast.error("ไม่สามารถดึงตำแหน่งได้"),
                    );
                  }}
                >
                  <MapPin className="h-4 w-4 mr-2" /> ใช้ตำแหน่งปัจจุบัน
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-name">ชื่อผู้รับ</Label>
                <Input
                  id="contact-name"
                  placeholder="ชื่อผู้รับสินค้า"
                  maxLength={100}
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone-primary">เบอร์ติดต่อหลัก *</Label>
                <Input
                  id="phone-primary"
                  type="tel"
                  inputMode="tel"
                  placeholder="08x-xxx-xxxx"
                  maxLength={20}
                  value={phonePrimary}
                  onChange={(e) => setPhonePrimary(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone-secondary">เบอร์ติดต่อสำรอง</Label>
                <Input
                  id="phone-secondary"
                  type="tel"
                  inputMode="tel"
                  placeholder="ไม่บังคับ"
                  maxLength={20}
                  value={phoneSecondary}
                  onChange={(e) => setPhoneSecondary(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rider-note">โน้ตถึงไรเดอร์</Label>
                <Textarea
                  id="rider-note"
                  placeholder="เช่น ตึก B ชั้น 3 โทรก่อนถึง"
                  maxLength={300}
                  value={riderNote}
                  onChange={(e) => setRiderNote(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <SheetFooter>
              <Button onClick={saveAddress} disabled={savingAddr} className="w-full">
                {savingAddr ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
        <h1 className="text-2xl font-bold leading-tight">หิวอะไรวันนี้?</h1>
        <p className="text-sm text-muted-foreground mt-1">สวัสดี {user?.email?.split("@")[0]}</p>
      </header>

      <div className="px-4 pb-3 sticky top-0 bg-background/95 backdrop-blur z-10 pt-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ค้นหาร้านอาหาร เมนู..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition ${
                category === c
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <section className="px-4 pb-6 space-y-3">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <UtensilsCrossed className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>ยังไม่มีร้านในขณะนี้</p>
            <p className="text-xs mt-1">ลองเปลี่ยนหมวดหมู่หรือคำค้นหา</p>
          </div>
        ) : (
          filtered.map((r) => (
            <Link key={r.id} to="/restaurants/$restaurantId" params={{ restaurantId: r.id }}>
              <Card className="overflow-hidden p-0 hover:shadow-md transition">
                <div className="h-40 bg-gradient-to-br from-accent to-secondary relative">
                  {(r.cover_url || r.image_url) ? (
                    <img src={r.cover_url || r.image_url || ""} alt={r.name} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-primary/30">
                      <UtensilsCrossed className="h-12 w-12" />
                    </div>
                  )}
                  {!r.is_open && (
                    <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                      <span className="font-semibold text-foreground">ปิดอยู่</span>
                    </div>
                  )}
                </div>
                <div className="p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground">{r.name}</h3>
                    {r.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{r.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-primary text-primary" />
                        {Number(r.rating).toFixed(1)}
                      </span>
                      <span>•</span>
                      <span>ค่าส่ง ฿{Number(r.delivery_fee).toFixed(0)}</span>
                      {r.category && <><span>•</span><span>{r.category}</span></>}
                    </div>
                  </div>
                  {r.logo_url && (
                    <img
                      src={r.logo_url}
                      alt=""
                      className="h-14 w-14 rounded-full border border-border object-cover shrink-0"
                      loading="lazy"
                    />
                  )}
                </div>
              </Card>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
