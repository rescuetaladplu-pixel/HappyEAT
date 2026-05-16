import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, UserPlus, Users, Search, MailCheck, KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  createAdminAccount,
  listAdmins,
  listAllUsers,
  confirmUserEmail,
  resetUserPassword,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_app/admin")({
  component: AdminPage,
});

type AdminRow = { user_id: string; created_at: string; username: string | null; full_name: string | null };
type UserRow = {
  user_id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  full_name: string | null;
  phone: string | null;
  username: string | null;
  avatar_url: string | null;
  roles: string[];
};

const ROLE_LABEL: Record<string, string> = {
  customer: "ลูกค้า",
  restaurant: "ร้านค้า",
  rider: "ไรเดอร์",
  admin: "แอดมิน",
};

function AdminPage() {
  const { role } = useAuth();
  const [eatStats, setEatStats] = useState({ orders: 0, restaurants: 0, customers: 0, pendingOrders: 0 });
  const [riderStats, setRiderStats] = useState({ total: 0, online: 0, pendingApproval: 0, activeDeliveries: 0 });
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [pwTarget, setPwTarget] = useState<UserRow | null>(null);
  const [newPw, setNewPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const createFn = useServerFn(createAdminAccount);
  const listFn = useServerFn(listAdmins);
  const listUsersFn = useServerFn(listAllUsers);
  const confirmEmailFn = useServerFn(confirmUserEmail);
  const resetPwFn = useServerFn(resetUserPassword);

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

  async function loadAdmins() {
    try {
      const rows = await listFn();
      setAdmins(rows as AdminRow[]);
    } catch (e: any) {
      console.error(e);
    }
  }

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const rows = await listUsersFn();
      setUsers(rows as UserRow[]);
    } catch (e: any) {
      toast.error(e?.message ?? "โหลดรายชื่อผู้ใช้ไม่สำเร็จ");
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    if (role !== "admin") return;
    (async () => {
      const [orders, restaurants, customerRoles, pendingOrders, riderRoles, ridersAll] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("restaurants").select("id", { count: "exact", head: true }),
        supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "customer"),
        supabase.from("orders").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "rider"),
        supabase.from("riders").select("id, is_online, is_approved"),
      ]);
      const riderRows = ridersAll.data ?? [];
      const online = riderRows.filter((r: any) => r.is_online).length;
      const pendingApproval = riderRows.filter((r: any) => !r.is_approved).length;
      const { count: activeDeliveries } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .not("rider_id", "is", null)
        .in("status", ["rider_assigned", "picked_up", "on_the_way"]);
      setEatStats({
        orders: orders.count ?? 0,
        restaurants: restaurants.count ?? 0,
        customers: customerRoles.count ?? 0,
        pendingOrders: pendingOrders.count ?? 0,
      });
      setRiderStats({
        total: riderRoles.count ?? 0,
        online,
        pendingApproval,
        activeDeliveries: activeDeliveries ?? 0,
      });
    })();
    loadAdmins();
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await createFn({ data: { username: username.trim().toLowerCase(), password } });
      toast.success(`สร้างแอดมิน ${username} สำเร็จ`);
      setUsername("");
      setPassword("");
      loadAdmins();
    } catch (e: any) {
      toast.error(e?.message ?? "สร้างไม่สำเร็จ");
    } finally {
      setCreating(false);
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
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">แดชบอร์ดแอดมิน</h1>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="ออเดอร์" value={stats.orders} />
        <Stat label="ร้านค้า" value={stats.restaurants} />
        <Stat label="ไรเดอร์" value={stats.riders} />
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">สร้างแอดมินใหม่</h2>
        </div>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-username">Username</Label>
            <Input
              id="new-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="เช่น admin2"
              pattern="[a-z0-9_]{3,32}"
              title="a-z, 0-9, _ ความยาว 3-32 ตัว"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">รหัสผ่าน (อย่างน้อย 6 ตัว)</Label>
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </div>
          <Button type="submit" disabled={creating}>
            {creating ? "กำลังสร้าง..." : "สร้างแอดมิน"}
          </Button>
        </form>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold mb-3">รายชื่อแอดมิน ({admins.length})</h2>
        <div className="space-y-2">
          {admins.map((a) => (
            <div key={a.user_id} className="flex justify-between text-sm border-b last:border-0 py-2">
              <div>
                <p className="font-medium">{a.username ?? "(ไม่มี username)"}</p>
                <p className="text-xs text-muted-foreground">{a.full_name}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(a.created_at).toLocaleDateString("th-TH")}
              </p>
            </div>
          ))}
          {admins.length === 0 && (
            <p className="text-sm text-muted-foreground">ยังไม่มีแอดมิน</p>
          )}
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">ผู้ใช้ทั้งหมด ({users.length})</h2>
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
              placeholder="ค้นหาอีเมล / ชื่อ / เบอร์ / username"
              className="pl-8"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="all">ทุกบทบาท</option>
            <option value="customer">ลูกค้า</option>
            <option value="restaurant">ร้านค้า</option>
            <option value="rider">ไรเดอร์</option>
            <option value="admin">แอดมิน</option>
          </select>
        </div>

        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-5 py-2">ผู้ใช้</th>
                <th className="text-left font-medium px-3 py-2">อีเมล</th>
                <th className="text-left font-medium px-3 py-2">เบอร์โทร</th>
                <th className="text-left font-medium px-3 py-2">บทบาท</th>
                <th className="text-left font-medium px-3 py-2">สมัครเมื่อ</th>
                <th className="text-left font-medium px-3 py-2">เข้าระบบล่าสุด</th>
                <th className="text-left font-medium px-5 py-2">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {users
                .filter((u) => roleFilter === "all" || u.roles.includes(roleFilter))
                .filter((u) => {
                  if (!search.trim()) return true;
                  const q = search.trim().toLowerCase();
                  return (
                    (u.email ?? "").toLowerCase().includes(q) ||
                    (u.full_name ?? "").toLowerCase().includes(q) ||
                    (u.phone ?? "").toLowerCase().includes(q) ||
                    (u.username ?? "").toLowerCase().includes(q)
                  );
                })
                .map((u) => (
                  <tr key={u.user_id} className="border-b last:border-0 align-top">
                    <td className="px-5 py-2">
                      <p className="font-medium">{u.full_name || u.username || "—"}</p>
                      {u.username && u.full_name && (
                        <p className="text-xs text-muted-foreground">@{u.username}</p>
                      )}
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
                        {u.roles.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          u.roles.map((r) => (
                            <Badge
                              key={r}
                              variant={r === "admin" ? "default" : "secondary"}
                              className="text-xs"
                            >
                              {ROLE_LABEL[r] ?? r}
                            </Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(u.created_at).toLocaleDateString("th-TH")}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {u.last_sign_in_at
                        ? new Date(u.last_sign_in_at).toLocaleDateString("th-TH")
                        : "—"}
                    </td>
                    <td className="px-5 py-2 whitespace-nowrap">
                      <div className="flex gap-1.5">
                        {!u.email_confirmed && u.email && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleConfirmEmail(u)}
                            disabled={confirmingId === u.user_id}
                            title="ยืนยันอีเมลให้ผู้ใช้"
                          >
                            <MailCheck className="h-3.5 w-3.5 mr-1" />
                            {confirmingId === u.user_id ? "..." : "ยืนยัน"}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPwTarget(u);
                            setNewPw("");
                          }}
                          title="ตั้งรหัสผ่านใหม่"
                        >
                          <KeyRound className="h-3.5 w-3.5 mr-1" />
                          รหัสผ่าน
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {users.length === 0 && !usersLoading && (
            <p className="text-sm text-muted-foreground text-center py-6">ยังไม่มีผู้ใช้</p>
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
              <br />
              <span className="text-xs">
                ระบบไม่สามารถดูรหัสผ่านเดิมได้ (เข้ารหัสไว้) ใช้การตั้งรหัสใหม่แล้วแจ้งผู้ใช้แทน
              </span>
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
                {savingPw ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4 text-center">
      <p className="text-2xl font-bold text-primary">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}
