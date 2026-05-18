import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Shield, ChevronLeft, Ban, RefreshCw, User, Bike, Store, Clock, CreditCard, Star, FileImage, MapPin } from "lucide-react";
import { toast } from "sonner";
import {
  getOrderDetailForAdmin,
  adminCancelOrder,
  adminUpdateOrderStatus,
} from "@/lib/admin.functions";
import { STATUS_LABELS, STATUS_VARIANTS, type OrderStatus } from "@/lib/order-status";

export const Route = createFileRoute("/_app/admin/orders/$orderId")({
  component: AdminOrderDetail,
});

const ACTION_STATUSES: OrderStatus[] = [
  "awaiting_confirmations",
  "awaiting_payment",
  "awaiting_payment_confirm",
  "preparing",
  "ready",
  "picked_up",
  "delivering",
  "delivered",
  "cancelled",
];

function AdminOrderDetail() {
  const { role } = useAuth();
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [forceOpen, setForceOpen] = useState(false);
  const [forceStatus, setForceStatus] = useState<OrderStatus>("preparing");

  const detailFn = useServerFn(getOrderDetailForAdmin);
  const cancelFn = useServerFn(adminCancelOrder);
  const updateFn = useServerFn(adminUpdateOrderStatus);

  async function load() {
    setLoading(true);
    try {
      const d = await detailFn({ data: { orderId } });
      setData(d);
      setForceStatus((d.order.status as OrderStatus) ?? "preparing");
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
  }, [role, orderId]);

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

  const { order, items, promotions, customer, rider, reviews } = data;
  const restaurant = order.restaurants;

  const timeline: { label: string; at: string | null; icon?: string }[] = [
    { label: "ลูกค้าสร้างออเดอร์", at: order.created_at, icon: "🛒" },
    { label: "ร้านยืนยันรับออเดอร์", at: order.restaurant_accepted_at, icon: "🏪" },
    { label: "ไรเดอร์รับงาน", at: order.rider_accepted_at, icon: "🛵" },
    { label: "ลูกค้าส่งสลิป", at: order.payment_submitted_at, icon: "💸" },
    { label: "ร้านยืนยันการชำระเงิน", at: order.payment_confirmed_at, icon: "✅" },
    { label: "อัพเดตล่าสุด", at: order.updated_at, icon: "🕒" },
  ];

  function fmt(ts: string | null) {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "medium" });
  }

  async function handleCancel() {
    try {
      await cancelFn({ data: { orderId, reason: cancelReason.trim() || undefined } });
      toast.success("ยกเลิกแล้ว");
      setCancelOpen(false);
      setCancelReason("");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "ไม่สำเร็จ");
    }
  }

  async function handleForce() {
    try {
      await updateFn({ data: { orderId, status: forceStatus } });
      toast.success("เปลี่ยนสถานะแล้ว");
      setForceOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "ไม่สำเร็จ");
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-4">
      <button
        onClick={() => navigate({ to: "/admin/orders" })}
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        <ChevronLeft className="h-4 w-4" /> กลับ
      </button>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">ออเดอร์</h1>
          <p className="text-xs text-muted-foreground font-mono">{order.id}</p>
          <p className="text-xs text-muted-foreground">
            {new Date(order.created_at).toLocaleString("th-TH")}
          </p>
        </div>
        <Badge variant={STATUS_VARIANTS[order.status as OrderStatus] ?? "secondary"}>
          {STATUS_LABELS[order.status as OrderStatus] ?? order.status}
        </Badge>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> รีเฟรช
        </Button>
        <Button size="sm" variant="outline" onClick={() => setForceOpen(true)}>
          เปลี่ยนสถานะ
        </Button>
        {order.status !== "cancelled" && order.status !== "delivered" && (
          <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)}>
            <Ban className="h-3.5 w-3.5 mr-1" /> ยกเลิกออเดอร์
          </Button>
        )}
      </div>

      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="h-4 w-4" /> ไทม์ไลน์ออเดอร์
        </div>
        <div className="space-y-1.5 text-sm">
          {timeline.map((t) => (
            <div key={t.label} className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">
                {t.icon} {t.label}
              </span>
              <span className={`font-mono text-xs ${t.at ? "" : "text-muted-foreground/60"}`}>
                {fmt(t.at)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Store className="h-4 w-4" /> ร้านค้า
        </div>
        {restaurant ? (
          <div className="text-sm space-y-1">
            <p className="font-medium">{restaurant.name}</p>
            <p className="text-xs text-muted-foreground">
              {restaurant.phone ?? "—"} · {restaurant.address ?? "—"}
            </p>
            {restaurant.owner_id && (
              <Link
                to="/admin/users/$userId"
                params={{ userId: restaurant.owner_id }}
                className="text-xs text-primary hover:underline"
              >
                → ดูบัญชีเจ้าของร้าน
              </Link>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </Card>

      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <User className="h-4 w-4" /> ลูกค้า
        </div>
        <div className="text-sm space-y-1">
          <p className="font-medium">
            {[customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || "—"}
            {customer?.username && (
              <span className="text-xs text-muted-foreground"> @{customer.username}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {customer?.email ?? "—"} · {customer?.phone ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground flex items-start gap-1">
            <MapPin className="h-3 w-3 mt-0.5 shrink-0" /> {order.delivery_address}
            {order.delivery_lat && order.delivery_lng && (
              <a
                href={`https://www.google.com/maps?q=${order.delivery_lat},${order.delivery_lng}`}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline ml-1"
              >
                (แผนที่)
              </a>
            )}
          </p>
          {order.notes && (
            <p className="text-xs text-muted-foreground">📝 {order.notes}</p>
          )}
          <Link
            to="/admin/users/$userId"
            params={{ userId: order.customer_id }}
            className="text-xs text-primary hover:underline"
          >
            → ดูบัญชีลูกค้า
          </Link>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Bike className="h-4 w-4" /> ไรเดอร์
        </div>
        {rider ? (
          <div className="text-sm space-y-1">
            <p className="font-medium">
              {[rider.first_name, rider.last_name].filter(Boolean).join(" ") || "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {rider.email ?? "—"} · {rider.phone ?? "—"}
            </p>
            <Link
              to="/admin/users/$userId"
              params={{ userId: order.rider_id }}
              className="text-xs text-primary hover:underline"
            >
              → ดูบัญชีไรเดอร์
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">ยังไม่มีไรเดอร์รับงาน</p>
        )}
      </Card>

      <Card className="p-4 space-y-2">
        <h3 className="text-sm font-semibold">รายการอาหาร ({items.length})</h3>
        <div className="space-y-1.5 text-sm">
          {items.map((it: any) => (
            <div key={it.id} className="flex justify-between border-b last:border-0 py-1.5">
              <div className="min-w-0">
                <p className="font-medium">
                  {it.quantity}× {it.name}
                </p>
                {it.notes && <p className="text-xs text-muted-foreground">{it.notes}</p>}
              </div>
              <p className="font-medium">฿{(Number(it.price) * it.quantity).toFixed(0)}</p>
            </div>
          ))}
        </div>
        <div className="text-sm space-y-1 pt-2 border-t">
          <Row label="ค่าอาหาร" value={`฿${Number(order.subtotal).toFixed(0)}`} />
          <Row label="ค่าส่ง" value={`฿${Number(order.delivery_fee).toFixed(0)}`} />
          {Number(order.discount) > 0 && (
            <Row label="ส่วนลด" value={`-฿${Number(order.discount).toFixed(0)}`} />
          )}
          <Row label="รวม" value={`฿${Number(order.total).toFixed(0)}`} bold />
          <Row label="ชำระ" value={order.payment_method} />
        </div>
        {promotions.length > 0 && (
          <div className="text-xs text-muted-foreground pt-1">
            โปรโมชั่น: {promotions.map((p: any) => p.code).join(", ")}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CreditCard className="h-4 w-4" /> การชำระเงิน
        </div>
        <div className="text-sm space-y-1">
          <Row label="วิธีชำระ" value={order.payment_method} />
          <Row label="ยอดสุทธิ" value={`฿${Number(order.total).toFixed(0)}`} />
          {restaurant?.promptpay_holder_name && (
            <Row label="ชื่อบัญชี PromptPay" value={restaurant.promptpay_holder_name} />
          )}
          {restaurant?.promptpay_id && (
            <Row label="PromptPay ID" value={restaurant.promptpay_id} />
          )}
          <Row label="ส่งสลิปเมื่อ" value={fmt(order.payment_submitted_at)} />
          <Row label="ร้านยืนยันเมื่อ" value={fmt(order.payment_confirmed_at)} />
        </div>
        {order.payment_slip_url && (
          <a
            href={order.payment_slip_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
          >
            <FileImage className="h-3.5 w-3.5" /> เปิดดูสลิป
          </a>
        )}
      </Card>

      {order.delivery_otp && (
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">OTP ส่งของ</p>
          <p className="text-2xl font-bold font-mono tracking-widest">{order.delivery_otp}</p>
        </Card>
      )}

      {reviews && reviews.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Star className="h-4 w-4" /> รีวิวจากลูกค้า
          </div>
          {reviews.map((rv: any) => (
            <div key={rv.id} className="text-sm space-y-1 border-t pt-2 first:border-0 first:pt-0">
              <div className="flex gap-3 text-xs">
                {rv.restaurant_rating != null && <span>ร้าน: {"⭐".repeat(rv.restaurant_rating)}</span>}
                {rv.rider_rating != null && <span>ไรเดอร์: {"⭐".repeat(rv.rider_rating)}</span>}
              </div>
              {rv.comment && <p className="text-sm">{rv.comment}</p>}
              {rv.owner_reply && (
                <p className="text-xs text-muted-foreground border-l-2 pl-2">
                  ร้านตอบ: {rv.owner_reply}
                </p>
              )}
              <p className="text-[10px] text-muted-foreground">{fmt(rv.created_at)}</p>
            </div>
          ))}
        </Card>
      )}

      {order.rejection_reason && (
        <Card className="p-4 border-destructive/40">
          <p className="text-xs text-muted-foreground">เหตุผลยกเลิก/ปฏิเสธ</p>
          <p className="text-sm">{order.rejection_reason}</p>
        </Card>
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยกเลิกออเดอร์</DialogTitle>
          </DialogHeader>
          <Input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="เหตุผล (ไม่บังคับ)"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>ปิด</Button>
            <Button variant="destructive" onClick={handleCancel}>ยืนยันยกเลิก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={forceOpen} onOpenChange={setForceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เปลี่ยนสถานะออเดอร์</DialogTitle>
          </DialogHeader>
          <select
            value={forceStatus}
            onChange={(e) => setForceStatus(e.target.value as OrderStatus)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm w-full"
          >
            {ACTION_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <p className="text-xs text-amber-600">⚠️ bypass กระบวนการปกติ ใช้เท่าที่จำเป็น</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceOpen(false)}>ปิด</Button>
            <Button onClick={handleForce}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-base" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
