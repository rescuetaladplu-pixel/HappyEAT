import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef, ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Store, Upload, MapPin, Clock, Loader2, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { LocationPicker } from "@/components/restaurant/LocationPicker";

export const Route = createFileRoute("/_app/my-restaurant")({
  component: MyRestaurantPage,
});

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "จันทร์" },
  { key: "tue", label: "อังคาร" },
  { key: "wed", label: "พุธ" },
  { key: "thu", label: "พฤหัสบดี" },
  { key: "fri", label: "ศุกร์" },
  { key: "sat", label: "เสาร์" },
  { key: "sun", label: "อาทิตย์" },
];

interface OpeningHours {
  [k: string]: { open: string; close: string; closed: boolean };
}

interface Restaurant {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  phone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  logo_url: string | null;
  cover_url: string | null;
  is_open: boolean;
  opening_hours: OpeningHours;
}

const DEFAULT_HOURS: OpeningHours = Object.fromEntries(
  DAYS.map((d) => [d.key, { open: "09:00", close: "21:00", closed: false }]),
) as OpeningHours;

function MyRestaurantPage() {
  const { user, role } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [hours, setHours] = useState<OpeningHours>(DEFAULT_HOURS);

  const logoRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!user) return;
    const { data } = await supabase
      .from("restaurants")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();
    if (data) {
      const r = data as unknown as Restaurant;
      setRestaurant(r);
      setName(r.name ?? "");
      setDescription(r.description ?? "");
      setCategory(r.category ?? "");
      setPhone(r.phone ?? "");
      setAddress(r.address ?? "");
      setLogoUrl(r.logo_url);
      setCoverUrl(r.cover_url);
      setLat(r.latitude !== null ? Number(r.latitude) : null);
      setLng(r.longitude !== null ? Number(r.longitude) : null);
      setHours({ ...DEFAULT_HOURS, ...(r.opening_hours ?? {}) });
    }
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
      owner_id: user.id,
      name,
      description,
      category,
      phone,
      is_approved: true,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("สร้างร้านสำเร็จ");
    load();
  }

  async function saveProfile() {
    if (!restaurant) return;
    setSaving(true);
    const { error } = await supabase
      .from("restaurants")
      .update({
        name,
        description,
        category,
        phone,
        logo_url: logoUrl,
        cover_url: coverUrl,
      })
      .eq("id", restaurant.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("บันทึกโปรไฟล์สำเร็จ");
    load();
  }

  async function saveLocation() {
    if (!restaurant) return;
    setSaving(true);
    const { error } = await supabase
      .from("restaurants")
      .update({ address, latitude: lat, longitude: lng })
      .eq("id", restaurant.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("บันทึกตำแหน่งสำเร็จ");
  }

  async function saveHours() {
    if (!restaurant) return;
    setSaving(true);
    const { error } = await supabase
      .from("restaurants")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ opening_hours: hours as any })
      .eq("id", restaurant.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("บันทึกเวลาทำการสำเร็จ");
  }

  async function toggleOpen(open: boolean) {
    if (!restaurant) return;
    await supabase.from("restaurants").update({ is_open: open }).eq("id", restaurant.id);
    setRestaurant({ ...restaurant, is_open: open });
    toast.success(open ? "เปิดร้านแล้ว" : "ปิดร้านชั่วคราว");
  }

  async function uploadImage(
    e: ChangeEvent<HTMLInputElement>,
    kind: "logo" | "cover",
  ) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("restaurant-images")
      .upload(path, file, { upsert: true });
    if (upErr) return toast.error(upErr.message);
    const { data } = supabase.storage.from("restaurant-images").getPublicUrl(path);
    if (kind === "logo") setLogoUrl(data.publicUrl);
    else setCoverUrl(data.publicUrl);
    toast.success("อัปโหลดรูปแล้ว — อย่าลืมกดบันทึก");
  }

  if (loading) {
    return (
      <main className="p-6 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </main>
    );
  }

  if (role !== "restaurant" && role !== "admin") {
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

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{restaurant.name}</h1>
          <p className="text-sm text-muted-foreground">จัดการร้านของคุณ</p>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={restaurant.is_open} onCheckedChange={toggleOpen} />
          <span className="text-sm">{restaurant.is_open ? "เปิด" : "ปิด"}</span>
        </div>
      </div>

      <Button asChild variant="outline" className="w-full">
        <Link to="/restaurant-dashboard">
          <ClipboardList className="h-4 w-4 mr-2" />
          ไปยังเมนู & ออเดอร์
        </Link>
      </Button>

      <Tabs defaultValue="profile">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile"><Store className="h-4 w-4 mr-1" />โปรไฟล์</TabsTrigger>
          <TabsTrigger value="location"><MapPin className="h-4 w-4 mr-1" />ที่อยู่</TabsTrigger>
          <TabsTrigger value="hours"><Clock className="h-4 w-4 mr-1" />เวลา</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="p-5 space-y-4">
            <div className="space-y-2">
              <Label>ภาพหน้าปก</Label>
              <div className="relative h-32 w-full rounded-lg bg-muted overflow-hidden">
                {coverUrl && (
                  <img src={coverUrl} alt="cover" className="w-full h-full object-cover" />
                )}
              </div>
              <input
                ref={coverRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => uploadImage(e, "cover")}
              />
              <Button variant="outline" size="sm" onClick={() => coverRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> อัปโหลดภาพปก
              </Button>
            </div>

            <div className="space-y-2">
              <Label>โลโก้ร้าน</Label>
              <div className="flex items-center gap-3">
                <div className="h-20 w-20 rounded-full bg-muted overflow-hidden flex items-center justify-center">
                  {logoUrl ? (
                    <img src={logoUrl} alt="logo" className="w-full h-full object-cover" />
                  ) : (
                    <Store className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => uploadImage(e, "logo")}
                />
                <Button variant="outline" size="sm" onClick={() => logoRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" /> อัปโหลดโลโก้
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>ชื่อร้าน</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>รายละเอียด</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>หมวดหมู่</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>เบอร์โทรศัพท์</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>

            <Button onClick={saveProfile} disabled={saving} className="w-full">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              บันทึกโปรไฟล์
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="location">
          <Card className="p-5 space-y-4">
            <div className="space-y-2">
              <Label>ที่อยู่</Label>
              <Textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="เลขที่ ถนน ตำบล อำเภอ จังหวัด"
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
            <Button onClick={saveLocation} disabled={saving} className="w-full">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              บันทึกตำแหน่ง
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="hours">
          <Card className="p-5 space-y-3">
            {DAYS.map((d) => {
              const h = hours[d.key] ?? { open: "09:00", close: "21:00", closed: false };
              return (
                <div key={d.key} className="flex items-center gap-3">
                  <span className="w-20 text-sm">{d.label}</span>
                  <Switch
                    checked={!h.closed}
                    onCheckedChange={(v) =>
                      setHours({ ...hours, [d.key]: { ...h, closed: !v } })
                    }
                  />
                  {h.closed ? (
                    <span className="text-sm text-muted-foreground flex-1">ปิด</span>
                  ) : (
                    <>
                      <Input
                        type="time"
                        value={h.open}
                        onChange={(e) =>
                          setHours({ ...hours, [d.key]: { ...h, open: e.target.value } })
                        }
                        className="flex-1"
                      />
                      <span>-</span>
                      <Input
                        type="time"
                        value={h.close}
                        onChange={(e) =>
                          setHours({ ...hours, [d.key]: { ...h, close: e.target.value } })
                        }
                        className="flex-1"
                      />
                    </>
                  )}
                </div>
              );
            })}
            <Button onClick={saveHours} disabled={saving} className="w-full">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              บันทึกเวลาทำการ
            </Button>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
