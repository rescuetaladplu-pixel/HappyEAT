import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Shield, ChevronLeft, Search, Ban, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  listAllOrders,
  adminCancelOrder,
  adminUpdateOrderStatus,
} from "@/lib/admin.functions";
import { STATUS_LABELS, STATUS_VARIANTS, type OrderStatus } from "@/lib/order-status";

type OrdersSearch = { status?: string };

export const Route = createFileRoute("/_app/admin/orders")({
  component: AdminOrdersPage,
  validateSearch: (s: Record<string, unknown>): OrdersSearch => ({
    status: typeof s.status === "string" ? s.status : undefined,
  }),
});

type OrderRow = {
  id: string;
  status: string;
  total: number;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  payment_method: string;
  delivery_address: string;
  created_at: string;
  customer_id: string;
  restaurant_id: string;
  rider_id: string | null;
  restaurants: { name: string } | null;
};

const STATUS_FILTERS: { value: "all" | OrderStatus; label: string }[] = [
  { value: "all", label: "ทั้งหมด" },
  { value: "awaiting_confirmations", label: "รอยืนยัน" },
  { value: "awaiting_payment", label: "รอชำระ" },
  { value: "awaiting_payment_confirm", label: "รอตรวจสลิป" },
  { value: "preparing", label: "กำลังทำ" },
  { value: "ready", label: "พร้อมส่ง" },
  { value: "picked_up", label: "ไรเดอร์รับ" },
  { value: "delivering", label: "กำลังส่ง" },
  { value: "delivered", label: "ส่งสำเร็จ" },
  { value: "cancelled", label: "ยกเลิก" },
];

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

function AdminOrdersPage() {
  const { role } = useAuth();
  const searchParams = Route.useSearch();
  const initialStatus = (searchParams.status as OrderStatus | undefined) ?? "all";
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [status, setStatus] = useState<"all" | OrderStatus>(initialStatus);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<OrderRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [forceTarget, setForceTarget] = useState<OrderRow | null>(null);
  const [forceStatus, setForceStatus] = useState<OrderStatus>("preparing");

  const listFn = useServerFn(listAllOrders);
  const cancelFn = useServerFn(adminCancelOrder);
  const updateFn = useServerFn(adminUpdateOrderStatus);

  async function load() {
    setLoading(true);
    try {
      const rows = (await listFn({
        data: {
          status: status === "all" ? null : status,
          search: search.trim() || undefined,
          limit: 200,
        },
      })) as OrderRow[];
      setOrders(rows);
    } catch (e: any) {
      toast.error(e?.message ?? "โหลดออเดอร์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (role !== "admin") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, status]);

  async function handleCancel() {
    if (!cancelTarget) return;
    try {
      await cancelFn({
        data: { orderId: cancelTarget.id, reason: cancelReason.trim() || undefined },
      });
      toast.success("ยกเลิกออเดอร์แล้ว");
      setCancelTarget(null);
      setCancelReason("");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "ไม่สำเร็จ");
    }
  }

  async function handleForce() {
    if (!forceTarget) return;
    try {
      await updateFn({ data: { orderId: forceTarget.id, status: forceStatus } });
      toast.success("อัพเดตสถานะแล้ว");
      setForceTarget(null);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "ไม่สำเร็จ");
    }
  }

  if (role !== "admin") {
    return (
      <main className="p-6 text-center">
        <Shield className="h-12 w-12 mx-auto opacity-30 mb-2" />
        <p className="text-muted-foreground">เฉพาะแอดมินเท่านั้น</p>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link
          to="/admin"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" /> กลับ
        </Link>
      </div>
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <span>📋</span> จัดการออเดอร์ทั้งหมด
      </h1>

      <Card className="p-4 space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="ค้นหา id / ชื่อร้าน / ที่อยู่"
              className="pl-8"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            {loading ? "กำลังโหลด..." : "รีเฟรช"}
          </Button>
        </div>

        <div className="space-y-2">
          {orders.map((o) => (
            <div
              key={o.id}
              className="border rounded-md p-3 text-sm space-y-2"
            >
              <div className="flex justify-between items-start gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{o.restaurants?.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {new Date(o.created_at).toLocaleString("th-TH")} · {o.delivery_address}
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono">{o.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={STATUS_VARIANTS[o.status as OrderStatus] ?? "secondary"}
                    className="text-xs"
                  >
                    {STATUS_LABELS[o.status as OrderStatus] ?? o.status}
                  </Badge>
                  <span className="font-semibold text-primary">
                    ฿{Number(o.total).toFixed(0)}
                  </span>
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setForceTarget(o);
                    setForceStatus((o.status as OrderStatus) ?? "preparing");
                  }}
                >
                  เปลี่ยนสถานะ
                </Button>
                {o.status !== "cancelled" && o.status !== "delivered" && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setCancelTarget(o);
                      setCancelReason("");
                    }}
                  >
                    <Ban className="h-3.5 w-3.5 mr-1" /> ยกเลิก
                  </Button>
                )}
              </div>
            </div>
          ))}
          {orders.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              ไม่มีออเดอร์ในเงื่อนไขนี้
            </p>
          )}
        </div>
      </Card>

      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ยกเลิกออเดอร์</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ร้าน: {cancelTarget?.restaurants?.name} · ฿
            {cancelTarget && Number(cancelTarget.total).toFixed(0)}
          </p>
          <Input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="เหตุผล (ไม่บังคับ)"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              ปิด
            </Button>
            <Button variant="destructive" onClick={handleCancel}>
              ยืนยันยกเลิก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!forceTarget} onOpenChange={(o) => !o && setForceTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>เปลี่ยนสถานะออเดอร์</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ปัจจุบัน:{" "}
            {forceTarget && (STATUS_LABELS[forceTarget.status as OrderStatus] ?? forceTarget.status)}
          </p>
          <select
            value={forceStatus}
            onChange={(e) => setForceStatus(e.target.value as OrderStatus)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm w-full"
          >
            {ACTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <p className="text-xs text-amber-600">
            ⚠️ ใช้เฉพาะกรณีจำเป็น — bypass กระบวนการปกติ
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceTarget(null)}>
              ปิด
            </Button>
            <Button onClick={handleForce}>บันทึก</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
