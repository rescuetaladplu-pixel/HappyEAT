import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useRef, ChangeEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchActiveRestaurantId } from "@/lib/active-restaurant";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Store, Upload, MapPin, Clock, Loader2, ArrowLeft, QrCode } from "lucide-react";
import { toast } from "sonner";
import { LocationPicker } from "@/components/restaurant/LocationPicker";
import { PlaceAutocomplete } from "@/components/PlaceAutocomplete";
import { RESTAURANT_CATEGORIES, MAX_RESTAURANT_CATEGORIES } from "@/lib/restaurant-categories";

export const Route = createFileRoute("/_app/my-restaurant_/settings")({
  component: MyRestaurantSettingsPage,
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
  categories: string[] | null;
  phone: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  logo_url: string | null;
  cover_url: string | null;
  is_open: boolean;
  opening_hours: OpeningHours;
  promptpay_id: string | null;
  promptpay_holder_name: string | null;
  promptpay_mode: "id" | "qr_image" | null;
  promptpay_qr_url: string | null;
}

const DEFAULT_HOURS: OpeningHours = Object.fromEntries(
  DAYS.map((d) => [d.key, { open: "09:00", close: "21:00", closed: false }]),
) as OpeningHours;

function MyRestaurantSettingsPage() {
  const { user } = useAuth();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [hours, setHours] = useState<OpeningHours>(DEFAULT_HOURS);
  const [promptpayId, setPromptpayId] = useState("");
  const [promptpayHolderName, setPromptpayHolderName] = useState("");
  const [promptpayMode, setPromptpayMode] = useState<"id" | "qr_image">("id");
  const [promptpayQrUrl, setPromptpayQrUrl] = useState<string | null>(null);
  const [uploadingQr, setUploadingQr] = useState(false);
  const qrRef = useRef<HTMLInputElement>(null);

  const logoRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!user) return;
    const rid = await fetchActiveRestaurantId(user.id);
    const { data } = rid
      ? await supabase.from("restaurants").select("*").eq("id", rid).maybeSingle()
      : { data: null };
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
      setPromptpayId(r.promptpay_id ?? "");
      setPromptpayHolderName(r.promptpay_holder_name ?? "");
      setPromptpayMode((r.promptpay_mode as "id" | "qr_image") ?? "id");
      setPromptpayQrUrl(r.promptpay_qr_url ?? null);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function saveProfile() {
    if (!restaurant) return;
    setSaving(true);
    const { error } = await supabase
      .from("restaurants")
      .update({ name, description, category, phone, logo_url: logoUrl, cover_url: coverUrl })
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

  async function savePromptpay() {
    if (!restaurant) return;
    const id = promptpayId.replace(/[\s-]/g, "");
    if (promptpayMode === "id") {
      if (id && !/^\d{10}$|^\d{13}$/.test(id)) {
        return toast.error("PromptPay ต้องเป็นเบอร์โทร 10 หลัก หรือเลขบัตรประชาชน 13 หลัก");
      }
    } else {
      if (!promptpayQrUrl) {
        return toast.error("กรุณาอัปโหลดรูป QR ของร้าน");
      }
    }
    setSaving(true);
    const { error } = await supabase
      .from("restaurants")
      .update({
        promptpay_mode: promptpayMode,
        promptpay_id: promptpayMode === "id" ? (id || null) : null,
        promptpay_qr_url: promptpayMode === "qr_image" ? promptpayQrUrl : null,
        promptpay_holder_name: promptpayHolderName.trim() || null,
      })
      .eq("id", restaurant.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("บันทึก PromptPay สำเร็จ");
  }

  async function uploadQrImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("ไฟล์ใหญ่เกิน 5MB");
    setUploadingQr(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${user.id}/promptpay-qr-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("restaurant-images")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setUploadingQr(false);
      return toast.error(upErr.message);
    }
    const { data } = supabase.storage.from("restaurant-images").getPublicUrl(path);
    setPromptpayQrUrl(data.publicUrl);
    setUploadingQr(false);
    toast.success("อัปโหลด QR แล้ว — อย่าลืมกดบันทึก");
  }

  async function uploadImage(e: ChangeEvent<HTMLInputElement>, kind: "logo" | "cover") {
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

  if (!restaurant) {
    return (
      <main className="max-w-2xl mx-auto p-4">
        <Card className="p-6 text-center space-y-3">
          <p className="text-muted-foreground">ยังไม่พบร้านของคุณ</p>
          <Button asChild variant="outline">
            <Link to="/my-restaurant">กลับไปหน้าร้านของฉัน</Link>
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link to="/my-restaurant">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">จัดการข้อมูลร้านค้า</h1>
          <p className="text-sm text-muted-foreground">{restaurant.name}</p>
        </div>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile"><Store className="h-4 w-4 mr-1" />โปรไฟล์</TabsTrigger>
          <TabsTrigger value="location"><MapPin className="h-4 w-4 mr-1" />ที่อยู่</TabsTrigger>
          <TabsTrigger value="hours"><Clock className="h-4 w-4 mr-1" />เวลา</TabsTrigger>
          <TabsTrigger value="payment"><QrCode className="h-4 w-4 mr-1" />ชำระเงิน</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="p-5 space-y-4">
            <div className="space-y-2">
              <Label>ภาพหน้าปก</Label>
              <div className="relative h-32 w-full rounded-lg bg-muted overflow-hidden">
                {coverUrl && <img src={coverUrl} alt="cover" className="w-full h-full object-cover" />}
              </div>
              <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadImage(e, "cover")} />
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
                <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadImage(e, "logo")} />
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
              <Label>ค้นหาสถานที่</Label>
              <PlaceAutocomplete
                onSelect={(p) => {
                  setAddress(p.address);
                  if (p.lat !== null) setLat(p.lat);
                  if (p.lng !== null) setLng(p.lng);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>ที่อยู่ (แก้ไขเพิ่มเติมได้)</Label>
              <Textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="เลขที่ ถนน ตำบล อำเภอ จังหวัด" />
            </div>
            <div className="space-y-2">
              <Label>ปักหมุดบนแผนที่ (คลิกเพื่อเลือกตำแหน่ง)</Label>
              <LocationPicker
                lat={lat}
                lng={lng}
                onChange={(la, ln) => { setLat(la); setLng(ln); }}
              />
              {lat !== null && lng !== null && (
                <p className="text-xs text-muted-foreground">พิกัด: {lat.toFixed(5)}, {lng.toFixed(5)}</p>
              )}
              <Button
                variant="outline"
                size="sm"
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
            <Button onClick={saveLocation} disabled={saving} className="w-full">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              บันทึกตำแหน่ง
            </Button>
          </Card>
        </TabsContent>

        <TabsContent value="hours">
          <Card className="p-4 sm:p-5 space-y-2">
            {DAYS.map((d) => {
              const h = hours[d.key] ?? { open: "09:00", close: "21:00", closed: false };
              return (
                <div
                  key={d.key}
                  className="flex items-center gap-2 sm:gap-3 py-2 border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-2 w-[88px] shrink-0">
                    <Switch
                      checked={!h.closed}
                      onCheckedChange={(v) =>
                        setHours({ ...hours, [d.key]: { ...h, closed: !v } })
                      }
                    />
                    <span className="text-sm font-medium">{d.label}</span>
                  </div>
                  {h.closed ? (
                    <span className="text-sm text-muted-foreground flex-1 text-right">ปิด</span>
                  ) : (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <Input
                        type="time"
                        value={h.open}
                        onChange={(e) =>
                          setHours({ ...hours, [d.key]: { ...h, open: e.target.value } })
                        }
                        className="flex-1 min-w-0 px-2 text-sm text-center [&::-webkit-calendar-picker-indicator]:hidden"
                      />
                      <span className="text-muted-foreground text-xs">–</span>
                      <Input
                        type="time"
                        value={h.close}
                        onChange={(e) =>
                          setHours({ ...hours, [d.key]: { ...h, close: e.target.value } })
                        }
                        className="flex-1 min-w-0 px-2 text-sm text-center [&::-webkit-calendar-picker-indicator]:hidden"
                      />
                    </div>
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

        <TabsContent value="payment">
          <Card className="p-5 space-y-4">
            <div className="space-y-1">
              <h2 className="font-semibold flex items-center gap-2">
                <QrCode className="h-5 w-5" /> PromptPay สำหรับรับเงินค่าอาหาร
              </h2>
              <p className="text-xs text-muted-foreground">
                ลูกค้าจะสแกน QR นี้ชำระเงินค่าอาหารโดยตรงเข้าบัญชีร้าน
                ระบบไม่หักค่าธรรมเนียม
              </p>
            </div>

            {/* Mode picker */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPromptpayMode("id")}
                className={`rounded-lg border p-3 text-left text-sm transition ${
                  promptpayMode === "id"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-accent"
                }`}
              >
                <p className="font-semibold">กรอก PromptPay ID</p>
                <p className="text-xs text-muted-foreground mt-1">
                  ระบบสร้าง QR + ใส่ยอดเงินอัตโนมัติ (สะดวกลูกค้าที่สุด)
                </p>
              </button>
              <button
                type="button"
                onClick={() => setPromptpayMode("qr_image")}
                className={`rounded-lg border p-3 text-left text-sm transition ${
                  promptpayMode === "qr_image"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-accent"
                }`}
              >
                <p className="font-semibold">อัปโหลด QR ของร้าน</p>
                <p className="text-xs text-muted-foreground mt-1">
                  ใช้ QR ที่ร้านมีอยู่แล้ว (ลูกค้าต้องพิมพ์ยอดเอง)
                </p>
              </button>
            </div>

            {promptpayMode === "id" ? (
              <div className="space-y-2">
                <Label>เบอร์โทร / เลขบัตรประชาชนที่ผูก PromptPay</Label>
                <Input
                  inputMode="numeric"
                  placeholder="0812345678 หรือ 1234567890123"
                  value={promptpayId}
                  onChange={(e) => setPromptpayId(e.target.value)}
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground">
                  เบอร์โทร 10 หลัก หรือเลขบัตรประชาชน 13 หลัก
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>รูป QR PromptPay ของร้าน</Label>
                <div className="border rounded-lg bg-muted/30 p-3 flex flex-col items-center gap-2">
                  {promptpayQrUrl ? (
                    <img
                      src={promptpayQrUrl}
                      alt="QR ร้าน"
                      className="w-48 h-48 object-contain bg-white rounded"
                    />
                  ) : (
                    <div className="w-48 h-48 flex items-center justify-center text-xs text-muted-foreground">
                      ยังไม่ได้อัปโหลด
                    </div>
                  )}
                  <input
                    ref={qrRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={uploadQrImage}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => qrRef.current?.click()}
                    disabled={uploadingQr}
                  >
                    {uploadingQr ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {promptpayQrUrl ? "เปลี่ยนรูป QR" : "อัปโหลด QR"}
                  </Button>
                </div>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  ⚠️ QR แบบรูปภาพไม่มียอดเงินฝังอยู่ ลูกค้าต้องพิมพ์ยอดเองในแอปธนาคาร
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label>ชื่อบัญชี (แสดงให้ลูกค้าเห็นก่อนโอน)</Label>
              <Input
                placeholder="เช่น สมชาย ใจดี"
                value={promptpayHolderName}
                onChange={(e) => setPromptpayHolderName(e.target.value)}
                maxLength={100}
              />
            </div>
            <Button onClick={savePromptpay} disabled={saving} className="w-full">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              บันทึก PromptPay
            </Button>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
