import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, ChevronLeft, Store, User, CheckCircle, Ban, Trash2, MapPin, Phone, Clock, Star } from "lucide-react";
import { toast } from "sonner";
import {
  getRestaurantDetailForAdmin,
  approveRestaurant,
  suspendRestaurant,
  deleteRestaurant,
} from "@/lib/admin.functions";
import { STATUS_LABELS, STATUS_VARIANTS, type OrderStatus } from "@/lib/order-status";

export const Route = createFileRoute("/_app/admin/restaurants/$restaurantId")({
  component: AdminRestaurantDetail,
});

function AdminRestaurantDetail() {
  const { role } = useAuth();
  const { restaurantId } = Route.useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const detailFn = useServerFn(getRestaurantDetailForAdmin);
  const approveFn = useServerFn(approveRestaurant);
  const suspendFn = useServerFn(suspendRestaurant);
  const deleteFn = useServerFn(deleteRestaurant);

  async function load() {
    setLoading(true);
    try {
      setData(await detailFn({ data: { restaurantId } }));
    } catch (e: any) {
      toast.error(e?.message ?? "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (role !== "admin") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, restaurantId]);

  if (role !== "admin") {
    return (
      <main className="p-6 text-center">
        <Shield className="h-12 w-12 mx-auto opacity-30 mb-2" />
        <p className="text-muted-foreground">เฉพาะแอดมินเท่านั้น</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="max-w-3xl mx-auto p-4">
        <p className="text-sm text-muted-foreground">{loading ? "กำลังโหลด..." : "ไม่พบข้อมูล"}</p>
      </main>
    );
  }

  const { restaurant, owner, ownerEmail, menuItems, orders, promotions, reviews, stats } = data;

  async function handleApprove() {
    try {
      await approveFn({ data: { restaurantId } });
      toast.success("อนุมัติแล้ว");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "ไม่สำเร็จ");
    }
  }
  async function handleSuspend() {
    if (!confirm("ระงับร้านนี้?")) return;
    try {
      await suspendFn({ data: { restaurantId } });
      toast.success("ระงับแล้ว");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "ไม่สำเร็จ");
    }
  }
  async function handleDelete() {
    if (!confirm(`ลบร้าน "${restaurant.name}" ถาวร?`)) return;
    try {
      await deleteFn({ data: { restaurantId } });
      toast.success("ลบแล้ว");
      navigate({ to: "/admin/eat" });
    } catch (e: any) {
      toast.error(e?.message ?? "ไม่สำเร็จ");
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-4">
      <button
        onClick={() => window.history.back()}
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        <ChevronLeft className="h-4 w-4" /> กลับ
      </button>

      <div className="flex items-start gap-3">
        {restaurant.logo_url || restaurant.image_url ? (
          <img
            src={restaurant.logo_url ?? restaurant.image_url}
            alt={restaurant.name}
            className="h-16 w-16 rounded-lg object-cover bg-muted"
          />
        ) : (
          <div className="h-16 w-16 rounded-lg bg-muted flex items-center justify-center">
            <Store className="h-7 w-7 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold">{restaurant.name}</h1>
          <div className="flex gap-1 flex-wrap mt-1">
            {restaurant.is_approved ? (
              <Badge variant="secondary" className="text-xs">อนุมัติแล้ว</Badge>
            ) : (
              <Badge className="text-xs bg-amber-500">รออนุมัติ</Badge>
            )}
            <Badge variant={restaurant.is_open ? "default" : "outline"} className="text-xs">
              {restaurant.is_open ? "เปิด" : "ปิด"}
            </Badge>
            <Badge variant="outline" className="text-xs">
              ⭐ {Number(restaurant.rating ?? 0).toFixed(1)}
            </Badge>
          </div>
          {restaurant.description && (
            <p className="text-xs text-muted-foreground mt-1">{restaurant.description}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!restaurant.is_approved && (
          <Button size="sm" onClick={handleApprove}>
            <CheckCircle className="h-3.5 w-3.5 mr-1" /> อนุมัติร้าน
          </Button>
        )}
        {restaurant.is_approved && (
          <Button size="sm" variant="outline" onClick={handleSuspend}>
            <Ban className="h-3.5 w-3.5 mr-1" /> ระงับร้าน
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-destructive" onClick={handleDelete}>
          <Trash2 className="h-3.5 w-3.5 mr-1" /> ลบร้าน
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="ออเดอร์" value={stats.ordersTotal} />
        <Stat label="ส่งสำเร็จ" value={stats.ordersDelivered} />
        <Stat label="ยกเลิก" value={stats.ordersCancelled} />
        <Stat label="รายได้รวม" value={`฿${stats.revenue.toFixed(0)}`} />
        <Stat label="เมนูทั้งหมด" value={stats.menuTotal} />
        <Stat label="พร้อมขาย" value={stats.menuAvailable} />
      </div>

      {/* Owner */}
      <Card className="p-4 space-y-1 text-sm">
        <div className="flex items-center gap-2 font-semibold mb-1">
          <User className="h-4 w-4" /> เจ้าของร้าน
        </div>
        <p className="font-medium">
          {[owner?.first_name, owner?.last_name].filter(Boolean).join(" ") || "—"}
          {owner?.username && (
            <span className="text-xs text-muted-foreground"> @{owner.username}</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{ownerEmail ?? "—"} · {owner?.phone ?? "—"}</p>
        <Link
          to="/admin/users/$userId"
          params={{ userId: restaurant.owner_id }}
          className="text-xs text-primary hover:underline"
        >
          → ดูบัญชีเจ้าของ
        </Link>
      </Card>

      {/* Info */}
      <Card className="p-4 space-y-1 text-sm">
        <h3 className="font-semibold mb-1">ข้อมูลร้าน</h3>
        <Row icon={<Phone className="h-3.5 w-3.5" />} label="เบอร์" value={restaurant.phone ?? "—"} />
        <Row icon={<MapPin className="h-3.5 w-3.5" />} label="ที่อยู่" value={restaurant.address ?? "—"} />
        <Row label="หมวด" value={(restaurant.categories ?? []).join(", ") || restaurant.category || "—"} />
        <Row label="ค่าส่งตั้งต้น" value={`฿${Number(restaurant.delivery_fee ?? 0).toFixed(0)}`} />
        <Row label="PromptPay" value={`${restaurant.promptpay_holder_name ?? "—"} · ${restaurant.promptpay_id ?? "—"}`} />
        <Row icon={<Clock className="h-3.5 w-3.5" />} label="สมัครเมื่อ" value={new Date(restaurant.created_at).toLocaleString("th-TH")} />
        {restaurant.latitude && restaurant.longitude && (
          <a
            href={`https://www.google.com/maps?q=${restaurant.latitude},${restaurant.longitude}`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline"
          >
            → เปิดแผนที่ร้าน
          </a>
        )}
      </Card>

      {/* Menu */}
      <Card className="p-4 space-y-2 text-sm">
        <h3 className="font-semibold">เมนู ({menuItems.length})</h3>
        {menuItems.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มีเมนู</p>}
        <div className="space-y-1.5">
          {menuItems.map((m: any) => (
            <div key={m.id} className="flex items-center gap-2 border-b last:border-0 py-1.5">
              {m.image_url ? (
                <img src={m.image_url} alt={m.name} className="h-10 w-10 rounded object-cover" />
              ) : (
                <div className="h-10 w-10 rounded bg-muted" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.category ?? "—"}</p>
              </div>
              <div className="text-right">
                <p className="font-medium">฿{Number(m.price).toFixed(0)}</p>
                <p className="text-[10px] text-muted-foreground">
                  {m.is_available ? "พร้อมขาย" : "ปิด"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Promotions */}
      {promotions.length > 0 && (
        <Card className="p-4 space-y-2 text-sm">
          <h3 className="font-semibold">โปรโมชั่น ({promotions.length})</h3>
          {promotions.map((p: any) => (
            <div key={p.id} className="flex justify-between border-b last:border-0 py-1.5 text-xs">
              <div>
                <p className="font-medium">{p.code}</p>
                <p className="text-muted-foreground">
                  {p.type} · {p.value} · ใช้แล้ว {p.used_count}/{p.usage_limit ?? "∞"}
                </p>
              </div>
              <Badge variant={p.is_active ? "default" : "outline"} className="text-[10px] h-fit">
                {p.is_active ? "เปิด" : "ปิด"}
              </Badge>
            </div>
          ))}
        </Card>
      )}

      {/* Orders */}
      <Card className="p-4 space-y-2 text-sm">
        <h3 className="font-semibold">ออเดอร์ล่าสุด ({orders.length})</h3>
        {orders.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มี</p>}
        {orders.map((o: any) => (
          <Link
            key={o.id}
            to="/admin/orders/$orderId"
            params={{ orderId: o.id }}
            className="flex justify-between items-center border-b last:border-0 py-2 hover:bg-muted/40 -mx-2 px-2 rounded"
          >
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {new Date(o.created_at).toLocaleString("th-TH")}
              </p>
              <p className="text-[10px] text-muted-foreground font-mono">{o.id.slice(0, 8)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANTS[o.status as OrderStatus] ?? "secondary"} className="text-xs">
                {STATUS_LABELS[o.status as OrderStatus] ?? o.status}
              </Badge>
              <span className="font-semibold text-primary">฿{Number(o.total).toFixed(0)}</span>
            </div>
          </Link>
        ))}
      </Card>

      {/* Reviews */}
      {reviews.length > 0 && (
        <Card className="p-4 space-y-2 text-sm">
          <div className="flex items-center gap-2 font-semibold">
            <Star className="h-4 w-4" /> รีวิว ({reviews.length})
          </div>
          {reviews.slice(0, 10).map((rv: any) => (
            <div key={rv.id} className="border-t pt-2 first:border-0 first:pt-0 space-y-1">
              <div className="flex gap-3 text-xs">
                {rv.restaurant_rating != null && <span>{"⭐".repeat(rv.restaurant_rating)}</span>}
              </div>
              {rv.comment && <p className="text-sm">{rv.comment}</p>}
              {rv.owner_reply && (
                <p className="text-xs text-muted-foreground border-l-2 pl-2">
                  ร้านตอบ: {rv.owner_reply}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground">
                {new Date(rv.created_at).toLocaleString("th-TH")}
              </p>
            </div>
          ))}
        </Card>
      )}
    </main>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground flex items-center gap-1">{icon}{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-3 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </Card>
  );
}
