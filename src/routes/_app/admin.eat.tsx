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
  Store,
  Users,
  Search,
  MailCheck,
  KeyRound,
  CheckCircle,
  XCircle,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import {
  listAllUsers,
  confirmUserEmail,
  resetUserPassword,
  listRestaurantsForAdmin,
  approveRestaurant,
  suspendRestaurant,
  deleteRestaurant,
  listRecentOrders,
  deleteUserAccount,
} from "@/lib/admin.functions";
import { STATUS_LABELS, STATUS_VARIANTS, type OrderStatus } from "@/lib/order-status";

export const Route = createFileRoute("/_app/admin/eat")({
  component: AdminEatPage,
});

const ROLE_LABEL: Record<string, string> = {
  customer: "ลูกค้า",
  restaurant: "ร้านค้า",
  rider: "ไรเดอร์",
  admin: "แอดมิน",
};

type UserRow = {
  user_id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  username: string | null;
  avatar_url: string | null;
  roles: string[];
};

type RestaurantRow = {
  id: string;
  name: string;
  owner_id: string;
  is_approved: boolean;
  is_open: boolean;
  category: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
};

type OrderRow = {
  id: string;
  status: string;
  total: number;
  created_at: string;
  restaurants: { name: string } | null;
};

function displayName(p: { first_name: string | null; last_name: string | null }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
}

function AdminEatPage() {
  const { role } = useAuth();
  const [stats, setStats] = useState({
    ordersTotal: 0,
    ordersToday: 0,
    awaitingRestaurant: 0,
    awaitingPaymentConfirm: 0,
    preparing: 0,
    ready: 0,
    delivered: 0,
    cancelled: 0,
    restaurantsTotal: 0,
    restaurantsPending: 0,
    restaurantsOpen: 0,
    customers: 0,
  });
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [restoFilter, setRestoFilter] = useState<"all" | "approved" | "pending" | "open">("all");
  const [restoSearch, setRestoSearch] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "customer" | "restaurant">("all");
  const [recentOrders, setRecentOrders] = useState<OrderRow[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pwTarget, setPwTarget] = useState<UserRow | null>(null);
  const [newPw, setNewPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const listUsersFn = useServerFn(listAllUsers);
  const confirmEmailFn = useServerFn(confirmUserEmail);
  const resetPwFn = useServerFn(resetUserPassword);
  const listRestoFn = useServerFn(listRestaurantsForAdmin);
  const approveFn = useServerFn(approveRestaurant);
  const suspendFn = useServerFn(suspendRestaurant);
  const deleteFn = useServerFn(deleteRestaurant);
  const recentOrdersFn = useServerFn(listRecentOrders);
  const deleteUserFn = useServerFn(deleteUserAccount);

  async function loadStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();
    const [
      ordersTotal,
      ordersToday,
      awaitingRestaurant,
      awaitingPaymentConfirm,
      preparing,
      ready,
      delivered,
      cancelled,
      restaurantsTotal,
      restaurantsPending,
      restaurantsOpen,
      customers,
    ] = await Promise.all([
      supabase.from("orders").select("id", { count: "exact", head: true }),
      supabase.from("orders").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "awaiting_restaurant"),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "awaiting_payment_confirm"),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "preparing"),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "ready"),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "delivered"),
      supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "cancelled"),
      supabase.from("restaurants").select("id", { count: "exact", head: true }),
      supabase.from("restaurants").select("id", { count: "exact", head: true }).eq("is_approved", false),
      supabase.from("restaurants").select("id", { count: "exact", head: true }).eq("is_open", true).eq("is_approved", true),
      supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "customer"),
    ]);
    setStats({
      ordersTotal: ordersTotal.count ?? 0,
      ordersToday: ordersToday.count ?? 0,
      awaitingRestaurant: awaitingRestaurant.count ?? 0,
      awaitingPaymentConfirm: awaitingPaymentConfirm.count ?? 0,
      preparing: preparing.count ?? 0,
      ready: ready.count ?? 0,
      delivered: delivered.count ?? 0,
      cancelled: cancelled.count ?? 0,
      restaurantsTotal: restaurantsTotal.count ?? 0,
      restaurantsPending: restaurantsPending.count ?? 0,
      restaurantsOpen: restaurantsOpen.count ?? 0,
      customers: customers.count ?? 0,
    });
  }

  async function loadRestaurants() {
    try {
      setRestaurants((await listRestoFn()) as RestaurantRow[]);
    } catch (e: any) {
      toast.error(e?.message ?? "โหลดร้านไม่สำเร็จ");
    }
  }

  async function loadUsers() {
    setUsersLoading(true);
    try {
      setUsers((await listUsersFn()) as UserRow[]);
    } catch (e: any) {
      toast.error(e?.message ?? "โหลดผู้ใช้ไม่สำเร็จ");
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadRecent() {
    try {
      setRecentOrders((await recentOrdersFn({ data: { limit: 10 } })) as OrderRow[]);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    if (role !== "admin") return;
    loadStats();
    loadRestaurants();
    loadUsers();
    loadRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function handleApprove(r: RestaurantRow) {
    try {
      await approveFn({ data: { id: r.id } });
      toast.success(`อนุมัติร้าน ${r.name} แล้ว`);
      loadRestaurants();
      loadStats();
    } catch (e: any) {
      toast.error(e?.message ?? "ไม่สำเร็จ");
    }
  }

  async function handleSuspend(r: RestaurantRow) {
    if (!confirm(`ระงับร้าน "${r.name}"? ลูกค้าจะมองไม่เห็นจนกว่าจะอนุมัติใหม่`)) return;
    try {
      await suspendFn({ data: { id: r.id } });
      toast.success("ระงับร้านแล้ว");
      loadRestaurants();
      loadStats();
    } catch (e: any) {
      toast.error(e?.message ?? "ไม่สำเร็จ");
    }
  }

  async function handleDelete(r: RestaurantRow) {
    if (!confirm(`ลบร้าน "${r.name}" ถาวร? การกระทำนี้ย้อนกลับไม่ได้`)) return;
    try {
      await deleteFn({ data: { id: r.id } });
      toast.success("ลบร้านแล้ว");
      loadRestaurants();
      loadStats();
    } catch (e: any) {
      toast.error(e?.message ?? "ไม่สำเร็จ");
    }
  }

  async function handleConfirmEmail(u: UserRow) {
    setConfirmingId(u.user_id);
    try {
      await confirmEmailFn({ data: { userId: u.user_id } });
      toast.success(`ยืนยันอีเมล ${u.email} สำเร็จ`);
      loadUsers();
    } catch (e: any) {
      toast.error(e?.message ?? "ยืนยันไม่สำเร็จ");
    } finally {
      setConfirmingId(null);
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    if (!pwTarget) return;
    setSavingPw(true);
    try {
      await resetPwFn({ data: { userId: pwTarget.user_id, password: newPw } });
      toast.success(`ตั้งรหัสผ่านใหม่ให้ ${pwTarget.email} สำเร็จ`);
      setPwTarget(null);
      setNewPw("");
    } catch (e: any) {
      toast.error(e?.message ?? "ตั้งรหัสผ่านไม่สำเร็จ");
    } finally {
      setSavingPw(false);
    }
  }

  async function handleDeleteUser(u: UserRow) {
    if (!confirm(`ลบบัญชี ${u.email ?? displayName(u)} ถาวร? ข้อมูลทั้งหมดของผู้ใช้นี้จะถูกลบ`)) return;
    try {
      await deleteUserFn({ data: { userId: u.user_id } });
      toast.success("ลบบัญชีแล้ว");
      loadUsers();
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

  const filteredRestaurants = restaurants
    .filter((r) => {
      if (restoFilter === "approved") return r.is_approved;
      if (restoFilter === "pending") return !r.is_approved;
      if (restoFilter === "open") return r.is_open && r.is_approved;
      return true;
    })
    .filter((r) => {
      if (!restoSearch.trim()) return true;
      const q = restoSearch.trim().toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        (r.phone ?? "").toLowerCase().includes(q) ||
        (r.category ?? "").toLowerCase().includes(q)
      );
    });

  const pending = restaurants.filter((r) => !r.is_approved);
  const eatUsers = users.filter(
    (u) => u.roles.includes("customer") || u.roles.includes("restaurant"),
  );

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" /> กลับ
        </Link>
      </div>
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <span>🍔</span> จัดการฝั่ง Eat
      </h1>

      {/* Stats */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">ออเดอร์</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatLink to="/admin/orders" label="ออเดอร์ทั้งหมด" value={stats.ordersTotal} />
          <StatLink to="/admin/orders" label="วันนี้" value={stats.ordersToday} />
          <StatLink to="/admin/orders" search={{ status: "awaiting_restaurant" }} label="รอร้านยืนยัน" value={stats.awaitingRestaurant} highlight={stats.awaitingRestaurant > 0} />
          <StatLink to="/admin/orders" search={{ status: "awaiting_payment_confirm" }} label="รอตรวจสลิป" value={stats.awaitingPaymentConfirm} highlight={stats.awaitingPaymentConfirm > 0} />
          <StatLink to="/admin/orders" search={{ status: "preparing" }} label="กำลังทำ" value={stats.preparing} />
          <StatLink to="/admin/orders" search={{ status: "ready" }} label="พร้อมส่ง" value={stats.ready} />
          <StatLink to="/admin/orders" search={{ status: "delivered" }} label="ส่งสำเร็จ" value={stats.delivered} />
          <StatLink to="/admin/orders" search={{ status: "cancelled" }} label="ยกเลิก" value={stats.cancelled} />
        </div>

        <h2 className="text-sm font-semibold text-muted-foreground pt-2">ร้านค้า + ลูกค้า</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="ร้านทั้งหมด" value={stats.restaurantsTotal} />
          <Stat label="รออนุมัติ" value={stats.restaurantsPending} highlight={stats.restaurantsPending > 0} />
          <Stat label="เปิดอยู่" value={stats.restaurantsOpen} />
          <Stat label="ลูกค้า" value={stats.customers} />
        </div>
      </section>

      {/* Pending restaurants */}
      {pending.length > 0 && (
        <Card className="p-5 border-amber-500/40">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Store className="h-4 w-4 text-amber-600" /> ร้านรออนุมัติ ({pending.length})
          </h2>
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 border-b last:border-0 py-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.category ?? "—"} · {r.phone ?? "ไม่มีเบอร์"} · {r.address ?? "ไม่มีที่อยู่"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleApprove(r)}>
                    <CheckCircle className="h-3.5 w-3.5 mr-1" /> อนุมัติ
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(r)}>
                    <XCircle className="h-3.5 w-3.5 mr-1" /> ปฏิเสธ
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* All restaurants */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">ร้านค้าทั้งหมด ({restaurants.length})</h2>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={restoSearch}
              onChange={(e) => setRestoSearch(e.target.value)}
              placeholder="ค้นหาชื่อร้าน / เบอร์ / หมวด"
              className="pl-8"
            />
          </div>
          <select
            value={restoFilter}
            onChange={(e) => setRestoFilter(e.target.value as any)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="all">ทั้งหมด</option>
            <option value="approved">อนุมัติแล้ว</option>
            <option value="pending">รออนุมัติ</option>
            <option value="open">เปิดอยู่</option>
          </select>
        </div>
        <div className="space-y-2">
          {filteredRestaurants.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 border-b last:border-0 py-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{r.name}</p>
                  {r.is_approved ? (
                    <Badge variant="secondary" className="text-xs">อนุมัติแล้ว</Badge>
                  ) : (
                    <Badge className="text-xs bg-amber-500">รออนุมัติ</Badge>
                  )}
                  {r.is_approved && (
                    <Badge variant={r.is_open ? "default" : "outline"} className="text-xs">
                      {r.is_open ? "เปิด" : "ปิด"}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{r.category ?? "—"} · {r.phone ?? "—"}</p>
              </div>
              <div className="flex gap-1.5">
                {r.is_approved && (
                  <Button size="sm" variant="outline" onClick={() => handleSuspend(r)} title="ระงับร้าน">
                    <Ban className="h-3.5 w-3.5 mr-1" /> ระงับ
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(r)}>
                  ลบ
                </Button>
              </div>
            </div>
          ))}
          {filteredRestaurants.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">ไม่มีร้านในเงื่อนไขนี้</p>
          )}
        </div>
      </Card>

      {/* Users (Eat side only) */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">ผู้ใช้ฝั่ง Eat ({eatUsers.length})</h2>
          </div>
          <Button variant="outline" size="sm" onClick={loadUsers} disabled={usersLoading}>
            {usersLoading ? "กำลังโหลด..." : "รีเฟรช"}
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหาอีเมล / ชื่อ / เบอร์"
              className="pl-8"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="all">ทุกบทบาท</option>
            <option value="customer">ลูกค้า</option>
            <option value="restaurant">ร้านค้า</option>
          </select>
        </div>

        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-5 py-2">ผู้ใช้</th>
                <th className="text-left font-medium px-3 py-2">อีเมล</th>
                <th className="text-left font-medium px-3 py-2">เบอร์</th>
                <th className="text-left font-medium px-3 py-2">บทบาท</th>
                <th className="text-left font-medium px-5 py-2">การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {eatUsers
                .filter((u) => roleFilter === "all" || u.roles.includes(roleFilter))
                .filter((u) => {
                  if (!search.trim()) return true;
                  const q = search.trim().toLowerCase();
                  return (
                    (u.email ?? "").toLowerCase().includes(q) ||
                    displayName(u).toLowerCase().includes(q) ||
                    (u.phone ?? "").toLowerCase().includes(q)
                  );
                })
                .map((u) => (
                  <tr key={u.user_id} className="border-b last:border-0 align-top">
                    <td className="px-5 py-2">
                      <p className="font-medium">{displayName(u) || u.username || "—"}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="break-all">{u.email ?? "—"}</p>
                      {!u.email_confirmed && u.email && (
                        <p className="text-xs text-amber-600">ยังไม่ยืนยัน</p>
                      )}
                    </td>
                    <td className="px-3 py-2">{u.phone || "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {u.roles.map((r) => (
                          <Badge key={r} variant="secondary" className="text-xs">
                            {ROLE_LABEL[r] ?? r}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-2 whitespace-nowrap">
                      <div className="flex gap-1.5">
                        {!u.email_confirmed && u.email && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleConfirmEmail(u)}
                            disabled={confirmingId === u.user_id}
                          >
                            <MailCheck className="h-3.5 w-3.5 mr-1" />
                            ยืนยัน
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPwTarget(u);
                            setNewPw("");
                          }}
                        >
                          <KeyRound className="h-3.5 w-3.5 mr-1" /> รหัสผ่าน
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => handleDeleteUser(u)}
                        >
                          ลบบัญชี
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Recent orders */}
      <Card className="p-5">
        <h2 className="font-semibold mb-3">ออเดอร์ล่าสุด</h2>
        <div className="space-y-2">
          {recentOrders.map((o) => (
            <Link
              key={o.id}
              to="/admin/orders/$orderId"
              params={{ orderId: o.id }}
              className="flex justify-between items-center border-b last:border-0 py-2 text-sm hover:bg-muted/40 -mx-2 px-2 rounded"
            >
              <div className="min-w-0">
                <p className="font-medium truncate">{o.restaurants?.name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleString("th-TH")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_VARIANTS[o.status as OrderStatus] ?? "secondary"} className="text-xs">
                  {STATUS_LABELS[o.status as OrderStatus] ?? o.status}
                </Badge>
                <span className="font-semibold text-primary">฿{Number(o.total).toFixed(0)}</span>
              </div>
            </Link>
          ))}
          {recentOrders.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">ยังไม่มีออเดอร์</p>
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

function StatLink({
  to,
  search,
  label,
  value,
  highlight,
}: {
  to: string;
  search?: Record<string, string>;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <Link to={to} search={search as any} className="block">
      <Card className="p-4 text-center hover:border-primary hover:shadow-sm transition cursor-pointer">
        <p className={`text-2xl font-bold ${highlight ? "text-amber-600" : "text-primary"}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </Card>
    </Link>
  );
}
