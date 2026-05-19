import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRefetchOnFocus } from "@/hooks/use-refetch-on-focus";
import { isOpenNow, nextOpenLabel } from "@/lib/opening-hours";
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
import { PlaceAutocomplete } from "@/components/PlaceAutocomplete";
import { RESTAURANT_CATEGORIES } from "@/lib/restaurant-categories";
import {
  Search,
  MapPin,
  Star,
  UtensilsCrossed,
  ChevronRight,
  Plus,
  Trash2,
  Check,
  ArrowLeft,
  Heart,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useFavorites } from "@/lib/favorites";
import logoSrc from "@/assets/happyeat-logo.png";

const FAVORITES_CAT = "ร้านโปรด";

export const Route = createFileRoute("/_app/home")({
  component: HomePage,
});

interface Restaurant {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  categories: string[] | null;
  image_url: string | null;
  cover_url: string | null;
  logo_url: string | null;
  rating: number;
  delivery_fee: number;
  is_open: boolean;
  is_open_until: string | null;
  opening_hours: import("@/lib/opening-hours").OpeningHours | null;
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

const CATEGORIES = ["ทั้งหมด", FAVORITES_CAT, ...RESTAURANT_CATEGORIES];
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
  const { user, role, roles, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { isFavorite, toggle: toggleFav } = useFavorites();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ทั้งหมด");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const pre = sessionStorage.getItem("happyeat:home_cat");
      if (pre) {
        setCategory(pre);
        sessionStorage.removeItem("happyeat:home_cat");
      }
    } catch { /* ignore */ }
  }, []);

  // Address state — รองรับสูงสุด 3 ที่อยู่
  const MAX_ADDRESSES = 3;
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [addrOpen, setAddrOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addrLabel, setAddrLabel] = useState("บ้าน");
  const [addrText, setAddrText] = useState("");
  const [contactName, setContactName] = useState("");
  const [phonePrimary, setPhonePrimary] = useState("");
  const [phoneSecondary, setPhoneSecondary] = useState("");
  const [riderNote, setRiderNote] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [savingAddr, setSavingAddr] = useState(false);

  const currentAddr = addresses.find((a) => a.is_default) ?? addresses[0] ?? null;

  const loadRestaurants = useCallback(async () => {
    setLoading(true);
    try {
      setLoadError(null);
      const res = await withTimeout(
        supabase
          .from("restaurants_public")
          .select(
            "id, name, description, category, categories, image_url, cover_url, logo_url, rating, delivery_fee, is_open, is_open_until, opening_hours",
          )
          .eq("is_approved", true)
          .order("rating", { ascending: false }),
        10000,
      );
      if (res.error) throw new Error(res.error.message);
      setRestaurants((res.data ?? []) as Restaurant[]);
    } catch (error) {
      const message =
        error instanceof Error && error.message === "timeout"
          ? "โหลดร้านอาหารใช้เวลานานเกินไป"
          : "โหลดรายการร้านไม่สำเร็จ";
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRestaurants();
  }, [loadRestaurants]);

  useRefetchOnFocus(loadRestaurants);

  // Redirect legacy ?addr=1 → /addresses (รองรับลิงก์เก่า)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("addr") === "1") {
      window.history.replaceState({}, "", "/home");
      navigate({ to: "/addresses", search: { from: "/home" } });
    }
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    async function loadAddrs() {
      try {
        const res = await withTimeout(
          supabase
            .from("addresses")
            .select(
              "id, label, address, is_default, latitude, longitude, contact_name, phone_primary, phone_secondary, rider_note",
            )
            .eq("user_id", user!.id)
            .order("is_default", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(MAX_ADDRESSES),
          10000,
        );
        const rows = (res.data ?? []) as AddressRow[];
        setAddresses(rows);
      } catch {
        // ignore
      }
    }
    loadAddrs();
  }, [user]);

  function resetForm() {
    setEditingId(null);
    setAddrLabel("");
    setAddrText("");
    setContactName("");
    setPhonePrimary("");
    setPhoneSecondary("");
    setRiderNote("");
    setLat(null);
    setLng(null);
  }

  function openNewForm() {
    if (addresses.length >= MAX_ADDRESSES) {
      toast.error(`บันทึกได้สูงสุด ${MAX_ADDRESSES} ที่อยู่ กรุณาลบรายการก่อน`);
      return;
    }
    resetForm();
    setSheetMode("form");
  }

  function openEditForm(a: AddressRow) {
    setEditingId(a.id);
    setAddrLabel(a.label);
    setAddrText(a.address);
    setContactName(a.contact_name ?? "");
    setPhonePrimary(a.phone_primary ?? "");
    setPhoneSecondary(a.phone_secondary ?? "");
    setRiderNote(a.rider_note ?? "");
    setLat(a.latitude !== null ? Number(a.latitude) : null);
    setLng(a.longitude !== null ? Number(a.longitude) : null);
    setSheetMode("form");
  }

  function handleAddressOpen(nextOpen: boolean) {
    if (nextOpen && !authLoading && !user) {
      toast.error("กรุณาเข้าสู่ระบบก่อนบันทึกที่อยู่");
      navigate({ to: "/auth" });
      return;
    }
    setAddrOpen(nextOpen);
    if (nextOpen) {
      // ถ้ายังไม่มีที่อยู่เลย → เปิดฟอร์มเลย
      if (addresses.length === 0) {
        resetForm();
        setSheetMode("form");
      } else {
        setSheetMode("list");
      }
    }
  }

  async function selectAddress(id: string) {
    if (!user) return;
    const target = addresses.find((a) => a.id === id);
    if (!target) return;
    // optimistic
    setAddresses((prev) => prev.map((a) => ({ ...a, is_default: a.id === id })));
    setAddrOpen(false);
    toast.success(`ใช้ที่อยู่: ${target.label}`);
    try {
      await supabase
        .from("addresses")
        .update({ is_default: false })
        .eq("user_id", user.id)
        .neq("id", id);
      await supabase.from("addresses").update({ is_default: true }).eq("id", id);
    } catch {
      toast.error("สลับที่อยู่ไม่สำเร็จ");
    }
  }

  async function deleteAddress(id: string) {
    if (!user) return;
    const wasDefault = addresses.find((a) => a.id === id)?.is_default;
    const remaining = addresses.filter((a) => a.id !== id);
    setAddresses(remaining);
    try {
      const res = await supabase.from("addresses").delete().eq("id", id);
      if (res.error) throw res.error;
      // ถ้าลบตัว default → ตั้ง default ใหม่ให้ตัวแรกที่เหลือ
      if (wasDefault && remaining[0]) {
        await supabase.from("addresses").update({ is_default: true }).eq("id", remaining[0].id);
        setAddresses((prev) => prev.map((a, i) => ({ ...a, is_default: i === 0 })));
      }
      toast.success("ลบที่อยู่แล้ว");
    } catch {
      toast.error("ลบไม่สำเร็จ");
    }
  }

  async function saveAddress() {
    if (!addrText.trim()) return toast.error("กรุณากรอกที่อยู่");
    if (!phonePrimary.trim()) return toast.error("กรุณากรอกเบอร์ติดต่อหลัก");
    if (!PHONE_RE.test(phonePrimary.trim())) return toast.error("รูปแบบเบอร์ติดต่อหลักไม่ถูกต้อง");
    if (phoneSecondary.trim() && !PHONE_RE.test(phoneSecondary.trim()))
      return toast.error("รูปแบบเบอร์ติดต่อสำรองไม่ถูกต้อง");
    if (!editingId && addresses.length >= MAX_ADDRESSES) {
      return toast.error(`บันทึกได้สูงสุด ${MAX_ADDRESSES} ที่อยู่`);
    }
    setSavingAddr(true);
    try {
      const { data: sessionData } = await withTimeout(supabase.auth.getSession(), 5000);
      const activeUser = sessionData.session?.user ?? user;
      if (!activeUser) {
        toast.error("กรุณาเข้าสู่ระบบก่อนบันทึกที่อยู่");
        setAddrOpen(false);
        navigate({ to: "/auth" });
        return;
      }
      const payload = {
        user_id: activeUser.id,
        label: addrLabel.trim() || "ที่อยู่",
        address: addrText.trim(),
        is_default: true,
        latitude: lat,
        longitude: lng,
        contact_name: contactName.trim() || null,
        phone_primary: phonePrimary.trim(),
        phone_secondary: phoneSecondary.trim() || null,
        rider_note: riderNote.trim() || null,
      };
      const res = await withTimeout(
        editingId
          ? supabase.from("addresses").update(payload).eq("id", editingId).select().single()
          : supabase.from("addresses").insert(payload).select().single(),
        ADDRESS_SAVE_TIMEOUT_MS,
      );
      if (res.error) return toast.error(res.error.message);
      const saved = res.data as AddressRow;
      // unset default ของรายการอื่น
      await supabase
        .from("addresses")
        .update({ is_default: false })
        .eq("user_id", activeUser.id)
        .neq("id", saved.id);
      setAddresses((prev) => {
        const others = prev
          .filter((a) => a.id !== saved.id)
          .map((a) => ({ ...a, is_default: false }));
        return [saved, ...others].slice(0, MAX_ADDRESSES);
      });
      setSheetMode("list");
      resetForm();
      toast.success("บันทึกที่อยู่แล้ว");
    } catch (error) {
      const message =
        error instanceof Error && error.message === "timeout"
          ? "บันทึกที่อยู่ไม่สำเร็จ: การเชื่อมต่อใช้เวลานานเกินไป กรุณาลองใหม่"
          : "บันทึกที่อยู่ไม่สำเร็จ กรุณาลองใหม่";
      toast.error(message);
    } finally {
      setSavingAddr(false);
    }
  }

  const filtered = restaurants
    .filter((r) => {
      const cats =
        r.categories && r.categories.length > 0 ? r.categories : r.category ? [r.category] : [];
      const okCat =
        category === "ทั้งหมด" ||
        (category === FAVORITES_CAT ? isFavorite(r.id) : cats.includes(category));
      const okSearch = !search || r.name.toLowerCase().includes(search.toLowerCase());
      return okCat && okSearch;
    })
    .map((r) => {
      const withinHours = isOpenNow(r.opening_hours);
      const extendActive = !!(r.is_open_until && new Date(r.is_open_until) > new Date());
      const reallyOpen = r.is_open && (withinHours || extendActive);
      return { r, reallyOpen };
    })
    .sort((a, b) => Number(b.reallyOpen) - Number(a.reallyOpen))
    .map(({ r }) => r);

  // Block หน้าลูกค้าเฉพาะกรณีที่ user ไม่มี role customer เลย (เช่น admin/rider ล้วน)
  // ผู้ใช้ที่มีหลาย role (เช่น customer + restaurant) ยังคงเข้าหน้าลูกค้าได้ปกติ
  const isRestaurantOnly = role === "restaurant" && roles.length === 1 && roles[0] === "restaurant";

  if (role && role !== "customer" && !roles.includes("customer") && !isRestaurantOnly) {
    const dest =
      role === "restaurant"
        ? "/restaurant-dashboard"
        : role === "rider"
          ? "/rider-dashboard"
          : "/admin";
    return (
      <main className="p-6 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-2">ยินดีต้อนรับ</h1>
        <p className="text-muted-foreground mb-4">บัญชีนี้ไม่ใช่บัญชีลูกค้า</p>
        <Link to={dest} className="text-primary underline">
          ไปที่แดชบอร์ดของคุณ
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto">
      <header className="px-4 pt-2 pb-2">
        <div className="flex items-center justify-center">
          <img src={logoSrc} alt="HappyEAT" className="h-40 w-auto object-contain" />
        </div>
        <Sheet open={addrOpen} onOpenChange={handleAddressOpen}>
          <SheetTrigger asChild>
            <button className="flex items-center gap-2 mb-3 w-full text-left rounded-xl hover:bg-secondary/60 active:bg-secondary p-1 -m-1 transition">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> ส่งไปยัง
                </p>
                <p className="text-sm font-semibold truncate">
                  {currentAddr
                    ? `${currentAddr.label} · ${currentAddr.address}`
                    : "เพิ่มที่อยู่จัดส่ง"}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>เลือกที่อยู่จัดส่ง</SheetTitle>
            </SheetHeader>

            <div className="space-y-2 py-4">
              {addresses.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  ยังไม่มีที่อยู่บันทึกไว้
                </p>
              )}
              {addresses.map((a) => (
                <Card
                  key={a.id}
                  className={`p-3 transition ${a.is_default ? "border-primary ring-1 ring-primary" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => selectAddress(a.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <MapPin className="h-4 w-4 text-primary shrink-0" />
                      <span className="font-semibold truncate">{a.label}</span>
                      {a.is_default && (
                        <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <Check className="h-2.5 w-2.5" /> ใช้อยู่
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{a.address}</p>
                    {a.phone_primary && (
                      <p className="text-xs text-muted-foreground mt-0.5">โทร: {a.phone_primary}</p>
                    )}
                  </button>
                </Card>
              ))}
              <Link
                to="/addresses"
                search={{ from: "/home", new: addresses.length === 0 }}
                onClick={() => setAddrOpen(false)}
                className="flex items-center justify-center gap-2 w-full border rounded-lg py-2.5 text-sm font-medium hover:bg-secondary/50 transition"
              >
                <Plus className="h-4 w-4" />
                {addresses.length === 0 ? "เพิ่มที่อยู่จัดส่ง" : "จัดการที่อยู่ทั้งหมด"}
              </Link>
            </div>
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
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))
        ) : loadError ? (
          <div className="text-center py-12 text-muted-foreground space-y-3">
            <UtensilsCrossed className="h-12 w-12 mx-auto opacity-30" />
            <p>{loadError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true);
                loadRestaurants();
              }}
            >
              ลองใหม่
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <UtensilsCrossed className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>
              {restaurants.length === 0
                ? "ยังไม่มีร้านค้าออนไลน์ในขณะนี้"
                : "ไม่พบร้านที่ตรงกับคำค้นหา"}
            </p>
            <p className="text-xs mt-1">ลองเปลี่ยนหมวดหมู่หรือคำค้นหา</p>
          </div>
        ) : (
          filtered.map((r) => {
            const withinHours = isOpenNow(r.opening_hours);
            const extendActive = !!(r.is_open_until && new Date(r.is_open_until) > new Date());
            const reallyOpen = r.is_open && (withinHours || extendActive);
            let closedLabel: string | null = null;
            if (!r.is_open) {
              closedLabel = "ปิดอยู่";
            } else if (!withinHours && !extendActive) {
              closedLabel = nextOpenLabel(r.opening_hours) || "นอกเวลาทำการ";
            }
            return (
              <Link key={r.id} to="/restaurants/$restaurantId" params={{ restaurantId: r.id }}>
                <Card className="overflow-hidden p-0 hover:shadow-md transition">
                  <div className="aspect-[3/1] bg-gradient-to-br from-accent to-secondary relative">
                    {r.cover_url || r.image_url ? (
                      <img
                        src={r.cover_url || r.image_url || ""}
                        alt={r.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-primary/30">
                        <UtensilsCrossed className="h-12 w-12" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleFav(r.id);
                      }}
                      aria-label="ร้านโปรด"
                      className="absolute top-2 right-2 h-9 w-9 rounded-full bg-card/90 backdrop-blur flex items-center justify-center shadow hover:bg-card transition"
                    >
                      <Heart
                        className={`h-5 w-5 ${isFavorite(r.id) ? "fill-red-500 text-red-500" : "text-muted-foreground"}`}
                      />
                    </button>
                    {!reallyOpen && (
                      <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                        <span className="font-semibold text-foreground">{closedLabel}</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">{r.name}</h3>
                      {r.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                          {r.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-primary text-primary" />
                          {Number(r.rating).toFixed(1)}
                        </span>
                        <span>•</span>
                        <span>ค่าส่ง ฿{Number(r.delivery_fee).toFixed(0)}</span>
                        {(r.categories && r.categories.length > 0
                          ? r.categories
                          : r.category
                            ? [r.category]
                            : []
                        )
                          .slice(0, 2)
                          .map((c) => (
                            <span
                              key={c}
                              className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground text-[10px]"
                            >
                              {c}
                            </span>
                          ))}
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
            );
          })
        )}
      </section>
    </main>
  );
}
