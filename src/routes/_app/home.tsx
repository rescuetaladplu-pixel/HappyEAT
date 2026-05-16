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
import { Search, MapPin, Star, UtensilsCrossed, ChevronRight, Plus, Trash2, Check, ArrowLeft } from "lucide-react";
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

const CATEGORIES = [
  "ทั้งหมด",
  "ตามสั่ง",
  "ก๋วยเตี๋ยว",
  "ส้มตำ",
  "เครื่องดื่ม",
  "ของหวาน",
  "ฟาสต์ฟู้ด",
];
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
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ทั้งหมด");

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
          .from("restaurants")
          .select(
            "id, name, description, category, image_url, cover_url, logo_url, rating, delivery_fee, is_open, opening_hours",
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
      await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id).neq("id", id);
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
        const others = prev.filter((a) => a.id !== saved.id).map((a) => ({ ...a, is_default: false }));
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

  const filtered = restaurants.filter((r) => {
    const okCat = category === "ทั้งหมด" || r.category === category;
    const okSearch = !search || r.name.toLowerCase().includes(search.toLowerCase());
    return okCat && okSearch;
  });

  if (role && role !== "customer") {
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
                  {currentAddr ? `${currentAddr.label} · ${currentAddr.address}` : "เพิ่มที่อยู่จัดส่ง"}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[90vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {sheetMode === "form" && addresses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => { setSheetMode("list"); resetForm(); }}
                    className="p-1 -ml-1 rounded hover:bg-secondary"
                    aria-label="กลับ"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                )}
                {sheetMode === "list" ? "เลือกที่อยู่จัดส่ง" : editingId ? "แก้ไขที่อยู่" : "เพิ่มที่อยู่ใหม่"}
              </SheetTitle>
            </SheetHeader>

            {sheetMode === "list" ? (
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
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => selectAddress(a.id)}
                        className="flex-1 min-w-0 text-left"
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
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => openEditForm(a)}
                        >
                          แก้ไข
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => deleteAddress(a.id)}
                          aria-label="ลบ"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
                {addresses.length < MAX_ADDRESSES && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={openNewForm}
                  >
                    <Plus className="h-4 w-4 mr-2" /> เพิ่มที่อยู่ใหม่ ({addresses.length}/{MAX_ADDRESSES})
                  </Button>
                )}
                {addresses.length >= MAX_ADDRESSES && (
                  <p className="text-xs text-muted-foreground text-center">
                    บันทึกครบ {MAX_ADDRESSES} ที่อยู่แล้ว — ลบรายการเพื่อเพิ่มใหม่
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-3 py-4">
                  <div className="space-y-2">
                    <Label>ค้นหาสถานที่</Label>
                    <PlaceAutocomplete
                      onSelect={(p) => {
                        setAddrText(p.address);
                        if (p.lat !== null) setLat(p.lat);
                        if (p.lng !== null) setLng(p.lng);
                        // ใช้ชื่อสถานที่เป็นชื่อที่อยู่อัตโนมัติ
                        if (p.name) setAddrLabel(p.name);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="addr-label">ชื่อที่อยู่ (แก้ไขได้)</Label>
                    <Input
                      id="addr-label"
                      placeholder="เช่น บ้าน, ที่ทำงาน, โรงแรมฮิลตัน"
                      maxLength={50}
                      value={addrLabel}
                      onChange={(e) => setAddrLabel(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="addr-text">ที่อยู่ (แก้ไขเพิ่มเติมได้ เช่น เลขห้อง/ชั้น)</Label>
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
                    <LocationPicker
                      lat={lat}
                      lng={lng}
                      onChange={(la, ln) => {
                        setLat(la);
                        setLng(ln);
                      }}
                    />
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
                          (pos) => {
                            setLat(pos.coords.latitude);
                            setLng(pos.coords.longitude);
                          },
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
              </>
            )}
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
          filtered.map((r) => (
            <Link key={r.id} to="/restaurants/$restaurantId" params={{ restaurantId: r.id }}>
              <Card className="overflow-hidden p-0 hover:shadow-md transition">
                <div className="h-40 bg-gradient-to-br from-accent to-secondary relative">
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
                      {r.category && (
                        <>
                          <span>•</span>
                          <span>{r.category}</span>
                        </>
                      )}
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
