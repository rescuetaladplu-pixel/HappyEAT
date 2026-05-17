import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchActiveRestaurantId } from "@/lib/active-restaurant";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Pencil, Tag } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/restaurant/promotions")({
  component: PromotionsPage,
});

interface Promo {
  id: string;
  code: string;
  description: string | null;
  type: "percent" | "fixed";
  value: number;
  min_order: number;
  max_discount: number | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  used_count: number;
  is_active: boolean;
}

const empty: Partial<Promo> = {
  code: "", description: "", type: "percent", value: 10,
  min_order: 0, max_discount: null, starts_at: null, ends_at: null,
  usage_limit: null, is_active: true,
};

function PromotionsPage() {
  const { user } = useAuth();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Promo> | null>(null);

  async function load(rid: string) {
    const { data } = await supabase.from("promotions").select("*").eq("restaurant_id", rid).order("created_at", { ascending: false });
    setPromos((data ?? []) as Promo[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    fetchActiveRestaurantId(user.id).then((id) => {
      if (id) { setRestaurantId(id); load(id); } else setLoading(false);
    });
  }, [user]);

  async function save() {
    if (!restaurantId || !editing) return;
    if (!editing.code?.trim()) return toast.error("ใส่รหัสคูปอง");
    if (!editing.value || editing.value <= 0) return toast.error("ใส่ค่าส่วนลด");

    const payload = {
      restaurant_id: restaurantId,
      code: editing.code.trim().toUpperCase(),
      description: editing.description ?? null,
      type: editing.type ?? "percent",
      value: editing.value,
      min_order: editing.min_order ?? 0,
      max_discount: editing.max_discount ?? null,
      starts_at: editing.starts_at || null,
      ends_at: editing.ends_at || null,
      usage_limit: editing.usage_limit ?? null,
      is_active: editing.is_active ?? true,
    };

    const { error } = editing.id
      ? await supabase.from("promotions").update(payload).eq("id", editing.id)
      : await supabase.from("promotions").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("บันทึกแล้ว");
    setEditing(null);
    load(restaurantId);
  }

  async function toggle(p: Promo, active: boolean) {
    await supabase.from("promotions").update({ is_active: active }).eq("id", p.id);
    if (restaurantId) load(restaurantId);
  }

  async function remove(p: Promo) {
    if (!confirm(`ลบคูปอง ${p.code}?`)) return;
    await supabase.from("promotions").delete().eq("id", p.id);
    if (restaurantId) load(restaurantId);
  }

  if (loading) return <main className="p-6">กำลังโหลด...</main>;
  if (!restaurantId) {
    return (
      <main className="max-w-2xl mx-auto p-6 text-center space-y-3">
        <p>ยังไม่มีร้าน</p>
        <Button asChild><Link to="/my-restaurant">ไปตั้งค่าร้าน</Link></Button>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto p-4 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm"><Link to="/my-restaurant"><ArrowLeft className="h-4 w-4 mr-1" />หน้าร้าน</Link></Button>
        <Button onClick={() => setEditing({ ...empty })}><Plus className="h-4 w-4 mr-1" />คูปองใหม่</Button>
      </div>

      <div className="flex items-center gap-2">
        <Tag className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">โปรโมชั่น</h1>
      </div>

      {promos.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          ยังไม่มีคูปอง — กด "คูปองใหม่" เพื่อสร้าง
        </Card>
      ) : (
        <div className="space-y-2">
          {promos.map((p) => (
            <Card key={p.id} className="p-4 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-lg">{p.code}</span>
                    {!p.is_active && <Badge variant="outline">ปิด</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {p.type === "percent" ? `ลด ${p.value}%` : `ลด ฿${p.value}`}
                    {p.min_order > 0 && ` • ขั้นต่ำ ฿${p.min_order}`}
                    {p.max_discount && ` • สูงสุด ฿${p.max_discount}`}
                  </p>
                  {p.description && <p className="text-xs text-muted-foreground italic">{p.description}</p>}
                  <p className="text-xs text-muted-foreground">
                    ใช้แล้ว {p.used_count}{p.usage_limit ? ` / ${p.usage_limit}` : ""} ครั้ง
                    {p.ends_at && ` • หมดอายุ ${new Date(p.ends_at).toLocaleDateString("th-TH")}`}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Switch checked={p.is_active} onCheckedChange={(v) => toggle(p, v)} />
                  <Button size="icon" variant="ghost" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(p)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing?.id ? "แก้ไขคูปอง" : "คูปองใหม่"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>รหัสคูปอง *</Label>
                <Input value={editing.code ?? ""} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} placeholder="เช่น WELCOME10" />
              </div>
              <div className="space-y-1.5">
                <Label>คำอธิบาย</Label>
                <Input value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>ประเภท</Label>
                  <Select value={editing.type} onValueChange={(v) => setEditing({ ...editing, type: v as "percent" | "fixed" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">เปอร์เซ็นต์ (%)</SelectItem>
                      <SelectItem value="fixed">จำนวนเงิน (฿)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>ค่าส่วนลด *</Label>
                  <Input type="number" value={editing.value ?? ""} onChange={(e) => setEditing({ ...editing, value: Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>ยอดขั้นต่ำ (฿)</Label>
                  <Input type="number" value={editing.min_order ?? 0} onChange={(e) => setEditing({ ...editing, min_order: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>ลดสูงสุด (฿)</Label>
                  <Input type="number" value={editing.max_discount ?? ""} onChange={(e) => setEditing({ ...editing, max_discount: e.target.value ? Number(e.target.value) : null })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label>เริ่ม</Label>
                  <Input type="datetime-local" value={editing.starts_at?.slice(0, 16) ?? ""} onChange={(e) => setEditing({ ...editing, starts_at: e.target.value || null })} />
                </div>
                <div className="space-y-1.5">
                  <Label>หมดอายุ</Label>
                  <Input type="datetime-local" value={editing.ends_at?.slice(0, 16) ?? ""} onChange={(e) => setEditing({ ...editing, ends_at: e.target.value || null })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>จำกัดจำนวนครั้ง (เว้นว่าง = ไม่จำกัด)</Label>
                <Input type="number" value={editing.usage_limit ?? ""} onChange={(e) => setEditing({ ...editing, usage_limit: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div className="flex items-center justify-between">
                <Label>เปิดใช้งาน</Label>
                <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>ยกเลิก</Button>
            <Button onClick={save}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
