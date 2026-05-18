import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Shield,
  ChevronLeft,
  Bike,
  Search,
  MailCheck,
  KeyRound,
  CheckCircle,
  Ban,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import {
  confirmUserEmail,
  resetUserPassword,
  listRidersForAdmin,
  approveRider,
  suspendRider,
  listActiveDeliveries,
  deleteUserAccount,
} from "@/lib/admin.functions";
import { STATUS_LABELS, STATUS_VARIANTS, type OrderStatus } from "@/lib/order-status";

export const Route = createFileRoute("/_app/admin/rider")({
  component: AdminRiderPage,
});

type RiderRow = {
  id: string;
  is_approved: boolean;
  is_online: boolean;
  vehicle_type: string | null;
  license_plate: string | null;
  rating: number;
  current_lat: number | null;
  current_lng: number | null;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

type DeliveryRow = {
  id: string;
  status: string;
  total: number;
  delivery_address: string;
  created_at: string;
  rider_id: string;
  restaurants: { name: string } | null;
};

function displayName(p: { first_name: string | null; last_name: string | null }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
}

function AdminRiderPage() {
  const { role } = useAuth();
  const [stats, setStats] = useState({
    total: 0,
    online: 0,
    pendingApproval: 0,
    activeDeliveries: 0,
    queue: 0,
    deliveredToday: 0,
  });
  const [riders, setRiders] = useState<RiderRow[]>([]);
  const [riderFilter, setRiderFilter] = useState<"all" | "approved" | "online" | "pending">("all");
  const [search, setSearch] = useState("");
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pwTarget, setPwTarget] = useState<RiderRow | null>(null);
  const [newPw, setNewPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const listRidersFn = useServerFn(listRidersForAdmin);
  const approveFn = useServerFn(approveRider);
  const suspendFn = useServerFn(suspendRider);
  const confirmEmailFn = useServerFn(confirmUserEmail);
  const resetPwFn = useServerFn(resetUserPassword);
  const activeFn = useServerFn(listActiveDeliveries);
  const deleteUserFn = useServerFn(deleteUserAccount);

  async function loadStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();
    const [riderRoles, ridersAll, active, queue, deliveredToday] = await Promise.all([
      supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "rider"),
      supabase.from("riders").select("is_online, is_approved"),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .not("rider_id", "is", null)
        .in("status", ["picked_up", "delivering"]),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .is("rider_id", null)
        .eq("status", "ready"),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "delivered")
        .gte("created_at", todayIso),
    ]);
    const rows = ridersAll.data ?? [];
    setStats({
      total: riderRoles.count ?? 0,
      online: rows.filter((r: any) => r.is_online).length,
      pendingApproval: rows.filter((r: any) => !r.is_approved).length,
      activeDeliveries: active.count ?? 0,
      queue: queue.count ?? 0,
      deliveredToday: deliveredToday.count ?? 0,
    });
  }

  async function loadRiders() {
    setLoading(true);
    try {
      setRiders((await listRidersFn()) as RiderRow[]);
    } catch (e: any) {
      toast.error(e?.message ?? "โหลดไรเดอร์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function loadDeliveries() {
    try {
      setDeliveries((await activeFn()) as DeliveryRow[]);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    if (role !== "admin") return;
    loadStats();
    loadRiders();
    loadDeliveries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function handleApprove(r: RiderRow) {
    try {
      await approveFn({ data: { id: r.id } });
      toast.success(`อนุมัติไรเดอร์ ${displayName(r) || r.email} แล้ว`);
      loadRiders();
      loadStats();
    } catch (e: any) {
      toast.error(e?.message ?? "ไม่สำเร็จ");
    }
  }

  async function handleSuspend(r: RiderRow) {
    if (!confirm(`ระงับสิทธิ์ไรเดอร์ ${displayName(r) || r.email}? เขาจะรับงานใหม่ไม่ได้`)) return;
    try {
      await suspendFn({ data: { id: r.id } });
      toast.success("ระงับสิทธิ์แล้ว");
      loadRiders();
      loadStats();
    } catch (e: any) {
      toast.error(e?.message ?? "ไม่สำเร็จ");
    }
  }

  async function handleConfirmEmail(r: RiderRow) {
    setConfirmingId(r.id);
    try {
      await confirmEmailFn({ data: { userId: r.id } });
      toast.success(`ยืนยันอีเมล ${r.email} แล้ว`);
      loadRiders();
    } catch (e: any) {
      toast.error(e?.message ?? "ไม่สำเร็จ");
    } finally {
      setConfirmingId(null);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    if (!pwTarget) return;
    setSavingPw(true);
    try {
      await resetPwFn({ data: { userId: pwTarget.id, password: newPw } });
      toast.success(`ตั้งรหัสผ่านใหม่ให้ ${pwTarget.email} สำเร็จ`);
      setPwTarget(null);
      setNewPw("");
    } catch (e: any) {
      toast.error(e?.message ?? "ไม่สำเร็จ");
    } finally {
      setSavingPw(false);
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

  const pending = riders.filter((r) => !r.is_approved);
  const filteredRiders = riders
    .filter((r) => {
      if (riderFilter === "approved") return r.is_approved;
      if (riderFilter === "pending") return !r.is_approved;
      if (riderFilter === "online") return r.is_online && r.is_approved;
      return true;
    })
    .filter((r) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        (r.email ?? "").toLowerCase().includes(q) ||
        displayName(r).toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q) ||
        (r.license_plate ?? "").toLowerCase().includes(q)
      );
    });

  const onlineList = riders.filter((r) => r.is_online && r.is_approved);

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> กลับ
        </Link>
      </div>
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <span>🛵</span> จัดการฝั่ง Rider
      </h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="ไรเดอร์ทั้งหมด" value={stats.total} />
        <Stat label="ออนไลน์ตอนนี้" value={stats.online} />
        <Stat label="รออนุมัติ" value={stats.pendingApproval} highlight={stats.pendingApproval > 0} />
        <Stat label="กำลังส่ง" value={stats.activeDeliveries} />
        <Stat label="งานในคิว" value={stats.queue} />
        <Stat label="ส่งสำเร็จวันนี้" value={stats.deliveredToday} />
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <Card className="p-5 border-amber-500/40">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Bike className="h-4 w-4 text-amber-600" /> ไรเดอร์รออนุมัติ ({pending.length})
          </h2>
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 border-b last:border-0 py-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{displayName(r) || r.email || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.email ?? "ไม่มีอีเมล"} · {r.phone ?? "ไม่มีเบอร์"} · {r.vehicle_type ?? "ไม่ระบุยานพาหนะ"} · {r.license_plate ?? "ไม่มีทะเบียน"}
                  </p>
                </div>
                <Button size="sm" onClick={() => handleApprove(r)}>
                  <CheckCircle className="h-3.5 w-3.5 mr-1" /> อนุมัติ
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Online riders */}
      <Card className="p-5">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
          </span>
          ไรเดอร์ออนไลน์ตอนนี้ ({onlineList.length})
        </h2>
        <div className="space-y-2">
          {onlineList.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 border-b last:border-0 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">{displayName(r) || r.email}</p>
                <p className="text-xs text-muted-foreground">{r.phone ?? "—"} · {r.vehicle_type ?? "—"} {r.license_plate ? `· ${r.license_plate}` : ""}</p>
              </div>
              {r.current_lat && r.current_lng && (
                <a
                  href={`https://www.google.com/maps?q=${r.current_lat},${r.current_lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary flex items-center gap-1"
                >
                  <MapPin className="h-3.5 w-3.5" /> ดูตำแหน่ง
                </a>
              )}
            </div>
          ))}
          {onlineList.length === 0 && (
            <p className="text-sm text-muted-foreground">ยังไม่มีไรเดอร์ออนไลน์</p>
          )}
        </div>
      </Card>

      {/* All riders */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Bike className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">ไรเดอร์ทั้งหมด ({riders.length})</h2>
          </div>
          <Button variant="outline" size="sm" onClick={loadRiders} disabled={loading}>
            {loading ? "กำลังโหลด..." : "รีเฟรช"}
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาชื่อ / อีเมล / เบอร์ / ทะเบียน"
              className="pl-8"
            />
          </div>
          <select
            value={riderFilter}
            onChange={(e) => setRiderFilter(e.target.value as any)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="all">ทั้งหมด</option>
            <option value="approved">อนุมัติแล้ว</option>
            <option value="pending">รออนุมัติ</option>
            <option value="online">ออนไลน์</option>
          </select>
        </div>

        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-5 py-2">ไรเดอร์</th>
                <th className="text-left font-medium px-3 py-2">อีเมล</th>
                <th className="text-left font-medium px-3 py-2">ยานพาหนะ</th>
                <th className="text-left font-medium px-3 py-2">สถานะ</th>
                <th className="text-left font-medium px-5 py-2">การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {filteredRiders.map((r) => (
                <tr key={r.id} className="border-b last:border-0 align-top">
                  <td className="px-5 py-2">
                    <p className="font-medium">{displayName(r) || "—"}</p>
                    <p className="text-xs text-muted-foreground">{r.phone ?? "—"}</p>
                  </td>
                  <td className="px-3 py-2 break-all">{r.email ?? "—"}</td>
                  <td className="px-3 py-2">
                    <p>{r.vehicle_type ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{r.license_plate ?? ""}</p>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.is_approved ? (
                        <Badge variant="secondary" className="text-xs">อนุมัติ</Badge>
                      ) : (
                        <Badge className="text-xs bg-amber-500">รออนุมัติ</Badge>
                      )}
                      {r.is_online && <Badge className="text-xs bg-green-600">ออนไลน์</Badge>}
                    </div>
                  </td>
                  <td className="px-5 py-2 whitespace-nowrap">
                    <div className="flex gap-1.5 flex-wrap">
                      {!r.is_approved && (
                        <Button size="sm" onClick={() => handleApprove(r)}>
                          <CheckCircle className="h-3.5 w-3.5 mr-1" /> อนุมัติ
                        </Button>
                      )}
                      {r.is_approved && (
                        <Button size="sm" variant="outline" onClick={() => handleSuspend(r)}>
                          <Ban className="h-3.5 w-3.5 mr-1" /> ระงับ
                        </Button>
                      )}
                      {r.email && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleConfirmEmail(r)}
                          disabled={confirmingId === r.id}
                          title="ยืนยันอีเมล"
                        >
                          <MailCheck className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPwTarget(r);
                          setNewPw("");
                        }}
                        title="ตั้งรหัสผ่านใหม่"
                      >
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRiders.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">ไม่มีไรเดอร์ในเงื่อนไขนี้</p>
          )}
        </div>
      </Card>

      {/* Active deliveries */}
      <Card className="p-5">
        <h2 className="font-semibold mb-3">งานที่กำลังส่ง ({deliveries.length})</h2>
        <div className="space-y-2">
          {deliveries.map((o) => {
            const rider = riders.find((r) => r.id === o.rider_id);
            return (
              <div key={o.id} className="flex justify-between items-center border-b last:border-0 py-2 text-sm gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{o.restaurants?.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    ไรเดอร์: {rider ? displayName(rider) || rider.email : "—"} · ไป {o.delivery_address}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANTS[o.status as OrderStatus] ?? "default"} className="text-xs">
                  {STATUS_LABELS[o.status as OrderStatus] ?? o.status}
                </Badge>
              </div>
            );
          })}
          {deliveries.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">ไม่มีงานกำลังส่ง</p>
          )}
        </div>
      </Card>

      <Dialog open={!!pwTarget} onOpenChange={(open) => !open && setPwTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ตั้งรหัสผ่านใหม่</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              ผู้ใช้: <span className="font-medium text-foreground">{pwTarget?.email}</span>
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="reset-pw">รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</Label>
              <Input
                id="reset-pw"
                type="text"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                minLength={6}
                required
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPwTarget(null)}>
                ยกเลิก
              </Button>
              <Button type="submit" disabled={savingPw}>
                {savingPw ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <Card className="p-4 text-center">
      <p className={`text-2xl font-bold ${highlight ? "text-amber-600" : "text-primary"}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}
