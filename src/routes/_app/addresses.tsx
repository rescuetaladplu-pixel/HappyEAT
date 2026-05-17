import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PlaceAutocomplete } from "@/components/PlaceAutocomplete";
import { LocationPicker } from "@/components/restaurant/LocationPicker";
import { ArrowLeft, MapPin, Plus, Trash2, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

const searchSchema = z.object({
  from: z.string().optional(),
  new: z.coerce.boolean().optional(),
});

export const Route = createFileRoute("/_app/addresses")({
  validateSearch: searchSchema,
  component: AddressesPage,
});

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

const MAX_ADDRESSES = 3;
const PHONE_RE = /^[0-9+\-\s()]{8,20}$/;

function AddressesPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { from, new: openNew } = Route.useSearch();
  const backTo = from && from.startsWith("/") ? from : "/home";

  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // form fields
  const [addrLabel, setAddrLabel] = useState("");
  const [addrText, setAddrText] = useState("");
  const [contactName, setContactName] = useState("");
  const [phonePrimary, setPhonePrimary] = useState("");
  const [phoneSecondary, setPhoneSecondary] = useState("");
  const [riderNote, setRiderNote] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

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

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    async function load() {
      const { data } = await supabase
        .from("addresses")
        .select(
          "id, label, address, is_default, latitude, longitude, contact_name, phone_primary, phone_secondary, rider_note",
        )
        .eq("user_id", user!.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(MAX_ADDRESSES);
      const rows = (data ?? []) as AddressRow[];
      setAddresses(rows);
      setLoading(false);
      // เปิดฟอร์มอัตโนมัติถ้า: ?new=1 หรือยังไม่มีที่อยู่เลย
      if (openNew || rows.length === 0) {
        resetForm();
        setMode("form");
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user]);

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
    setMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openNewForm() {
    if (addresses.length >= MAX_ADDRESSES) {
      toast.error(`บันทึกได้สูงสุด ${MAX_ADDRESSES} ที่อยู่ กรุณาลบรายการก่อน`);
      return;
    }
    resetForm();
    setMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function selectAddress(id: string) {
    if (!user) return;
    const target = addresses.find((a) => a.id === id);
    if (!target) return;
    setAddresses((prev) => prev.map((a) => ({ ...a, is_default: a.id === id })));
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
    if (!confirm("ลบที่อยู่นี้ใช่ไหม?")) return;
    const wasDefault = addresses.find((a) => a.id === id)?.is_default;
    const remaining = addresses.filter((a) => a.id !== id);
    setAddresses(remaining);
    try {
      const { error } = await supabase.from("addresses").delete().eq("id", id);
      if (error) throw error;
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
    if (!user) return;
    if (!addrText.trim()) return toast.error("กรุณากรอกที่อยู่");
    if (!phonePrimary.trim()) return toast.error("กรุณากรอกเบอร์ติดต่อหลัก");
    if (!PHONE_RE.test(phonePrimary.trim())) return toast.error("รูปแบบเบอร์ติดต่อหลักไม่ถูกต้อง");
    if (phoneSecondary.trim() && !PHONE_RE.test(phoneSecondary.trim()))
      return toast.error("รูปแบบเบอร์ติดต่อสำรองไม่ถูกต้อง");
    if (!editingId && addresses.length >= MAX_ADDRESSES) {
      return toast.error(`บันทึกได้สูงสุด ${MAX_ADDRESSES} ที่อยู่`);
    }
    setSaving(true);
    const payload = {
      user_id: user.id,
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
    try {
      const res = editingId
        ? await supabase.from("addresses").update(payload).eq("id", editingId).select().single()
        : await supabase.from("addresses").insert(payload).select().single();
      if (res.error) {
        toast.error(res.error.message);
        return;
      }
      const saved = res.data as AddressRow;
      await supabase
        .from("addresses")
        .update({ is_default: false })
        .eq("user_id", user.id)
        .neq("id", saved.id);
      setAddresses((prev) => {
        const others = prev.filter((a) => a.id !== saved.id).map((a) => ({ ...a, is_default: false }));
        return [saved, ...others].slice(0, MAX_ADDRESSES);
      });
      toast.success("บันทึกที่อยู่แล้ว");
      resetForm();
      setMode("list");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-4 pb-24">
      <div className="flex items-center gap-2">
        {mode === "form" && addresses.length > 0 ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              resetForm();
              setMode("list");
            }}
            aria-label="กลับไปรายการ"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        ) : (
          <Button asChild variant="ghost" size="icon" aria-label="ย้อนกลับ">
            <Link to={backTo}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight truncate">
            {mode === "form" ? (editingId ? "แก้ไขที่อยู่" : "เพิ่มที่อยู่ใหม่") : "จัดการที่อยู่จัดส่ง"}
          </h1>
          {mode === "list" && (
            <p className="text-xs text-muted-foreground">
              บันทึกได้สูงสุด {MAX_ADDRESSES} ที่อยู่ ({addresses.length}/{MAX_ADDRESSES})
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : mode === "list" ? (
        <div className="space-y-2">
          {addresses.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              ยังไม่มีที่อยู่บันทึกไว้
            </Card>
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
          {addresses.length < MAX_ADDRESSES ? (
            <Button variant="outline" className="w-full" onClick={openNewForm}>
              <Plus className="h-4 w-4 mr-2" /> เพิ่มที่อยู่ใหม่
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground text-center">
              บันทึกครบ {MAX_ADDRESSES} ที่อยู่แล้ว — ลบรายการเพื่อเพิ่มใหม่
            </p>
          )}
        </div>
      ) : (
        <Card className="p-4 space-y-3">
          <div className="space-y-2">
            <Label>ค้นหาสถานที่</Label>
            <PlaceAutocomplete
              onSelect={(p) => {
                setAddrText(p.address);
                if (p.lat !== null) setLat(p.lat);
                if (p.lng !== null) setLng(p.lng);
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
          <Button onClick={saveAddress} disabled={saving} className="w-full">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            บันทึกที่อยู่
          </Button>
        </Card>
      )}
    </main>
  );
}
