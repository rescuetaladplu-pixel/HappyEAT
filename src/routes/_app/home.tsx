import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
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
  rating: number;
  delivery_fee: number;
  is_open: boolean;
}

interface AddressRow {
  id: string;
  label: string;
  address: string;
  is_default: boolean;
}

const CATEGORIES = ["ทั้งหมด", "ตามสั่ง", "ก๋วยเตี๋ยว", "ส้มตำ", "เครื่องดื่ม", "ของหวาน", "ฟาสต์ฟู้ด"];

function HomePage() {
  const { user, role } = useAuth();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ทั้งหมด");

  // Address state
  const [addr, setAddr] = useState<AddressRow | null>(null);
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrLabel, setAddrLabel] = useState("บ้าน");
  const [addrText, setAddrText] = useState("");
  const [savingAddr, setSavingAddr] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("restaurants")
        .select("id, name, description, category, image_url, rating, delivery_fee, is_open")
        .eq("is_approved", true)
        .order("rating", { ascending: false });
      setRestaurants((data ?? []) as Restaurant[]);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!user) return;
    async function loadAddr() {
      const { data } = await supabase
        .from("addresses")
        .select("id, label, address, is_default")
        .eq("user_id", user!.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setAddr(data as AddressRow);
        setAddrLabel(data.label);
        setAddrText(data.address);
      }
    }
    loadAddr();
  }, [user]);

  async function saveAddress() {
    if (!user) return;
    if (!addrText.trim()) return toast.error("กรุณากรอกที่อยู่");
    setSavingAddr(true);
    const payload = {
      user_id: user.id,
      label: addrLabel.trim() || "บ้าน",
      address: addrText.trim(),
      is_default: true,
    };
    let res;
    if (addr) {
      res = await supabase
        .from("addresses")
        .update(payload)
        .eq("id", addr.id)
        .select()
        .single();
    } else {
      res = await supabase.from("addresses").insert(payload).select().single();
    }
    setSavingAddr(false);
    if (res.error) return toast.error(res.error.message);
    setAddr(res.data as AddressRow);
    setAddrOpen(false);
    toast.success("บันทึกที่อยู่แล้ว");
  }

  const filtered = restaurants.filter((r) => {
    const okCat = category === "ทั้งหมด" || r.category === category;
    const okSearch = !search || r.name.toLowerCase().includes(search.toLowerCase());
    return okCat && okSearch;
  });

  // Non-customer roles see a redirect prompt
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
        <Sheet open={addrOpen} onOpenChange={setAddrOpen}>
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
          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>ที่อยู่จัดส่ง</SheetTitle>
            </SheetHeader>
            <div className="space-y-3 py-4">
              <div className="space-y-2">
                <Label htmlFor="addr-label">ชื่อสถานที่</Label>
                <Input
                  id="addr-label"
                  placeholder="เช่น บ้าน, ที่ทำงาน"
                  value={addrLabel}
                  onChange={(e) => setAddrLabel(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="addr-text">ที่อยู่</Label>
                <Textarea
                  id="addr-text"
                  placeholder="บ้านเลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด"
                  value={addrText}
                  onChange={(e) => setAddrText(e.target.value)}
                  rows={3}
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
                <div className="aspect-[2/1] bg-gradient-to-br from-accent to-secondary relative">
                  {r.image_url ? (
                    <img src={r.image_url} alt={r.name} className="w-full h-full object-cover" loading="lazy" />
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
                <div className="p-3">
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
              </Card>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
