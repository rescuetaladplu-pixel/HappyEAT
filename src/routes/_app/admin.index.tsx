import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, UserPlus, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { createAdminAccount, listAdmins } from "@/lib/admin.functions";

export const Route = createFileRoute("/_app/admin/")({
  component: AdminLanding,
});

type AdminRow = {
  user_id: string;
  created_at: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
};

function displayName(p: { first_name: string | null; last_name: string | null }): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
}

function AdminLanding() {
  const { role } = useAuth();
  const [eat, setEat] = useState({ orders: 0, restaurants: 0, customers: 0, pendingRestaurants: 0 });
  const [rider, setRider] = useState({ total: 0, online: 0, pendingApproval: 0, activeDeliveries: 0 });
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const createFn = useServerFn(createAdminAccount);
  const listFn = useServerFn(listAdmins);

  async function loadAdmins() {
    try {
      setAdmins((await listFn()) as AdminRow[]);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    if (role !== "admin") return;
    (async () => {
      const [orders, restaurants, pendingR, customers, riderRoles, ridersAll, active] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("restaurants").select("id", { count: "exact", head: true }),
        supabase.from("restaurants").select("id", { count: "exact", head: true }).eq("is_approved", false),
        supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "customer"),
        supabase.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "rider"),
        supabase.from("riders").select("is_online, is_approved"),
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .not("rider_id", "is", null)
          .in("status", ["picked_up", "delivering"]),
      ]);
      const riderRows = ridersAll.data ?? [];
      setEat({
        orders: orders.count ?? 0,
        restaurants: restaurants.count ?? 0,
        customers: customers.count ?? 0,
        pendingRestaurants: pendingR.count ?? 0,
      });
      setRider({
        total: riderRoles.count ?? 0,
        online: riderRows.filter((r: any) => r.is_online).length,
        pendingApproval: riderRows.filter((r: any) => !r.is_approved).length,
        activeDeliveries: active.count ?? 0,
      });
    })();
    loadAdmins();
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
    <main className="max-w-4xl mx-auto p-4 space-y-5">
      <h1 className="text-2xl font-bold">แดชบอร์ดแอดมิน</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          to="/admin/eat"
          className="group block rounded-lg border bg-card p-5 hover:border-primary hover:shadow-md transition"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-3xl">🍔</span>
              <div>
                <h2 className="font-bold text-lg">จัดการฝั่ง Eat</h2>
                <p className="text-xs text-muted-foreground">ลูกค้า + ร้านค้า + ออเดอร์</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniStat label="ออเดอร์รวม" value={eat.orders} />
            <MiniStat label="ร้านรออนุมัติ" value={eat.pendingRestaurants} highlight={eat.pendingRestaurants > 0} />
            <MiniStat label="ลูกค้า" value={eat.customers} />
          </div>
        </Link>

        <Link
          to="/admin/rider"
          className="group block rounded-lg border bg-card p-5 hover:border-primary hover:shadow-md transition"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-3xl">🛵</span>
              <div>
                <h2 className="font-bold text-lg">จัดการฝั่ง Rider</h2>
                <p className="text-xs text-muted-foreground">ไรเดอร์ + งานส่ง</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <MiniStat label="ออนไลน์" value={rider.online} />
            <MiniStat label="รออนุมัติ" value={rider.pendingApproval} highlight={rider.pendingApproval > 0} />
            <MiniStat label="กำลังส่ง" value={rider.activeDeliveries} />
          </div>
        </Link>

        <Link
          to="/admin/orders"
          className="group block rounded-lg border bg-card p-5 hover:border-primary hover:shadow-md transition md:col-span-2"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-3xl">📋</span>
              <div>
                <h2 className="font-bold text-lg">จัดการออเดอร์ทั้งหมด</h2>
                <p className="text-xs text-muted-foreground">
                  ดู / เปลี่ยนสถานะ / ยกเลิกออเดอร์ทุกออเดอร์
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition" />
          </div>
        </Link>
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
                <p className="text-xs text-muted-foreground">{displayName(a)}</p>
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
    </main>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-md bg-muted/40 py-2">
      <p className={`text-lg font-bold ${highlight ? "text-amber-600" : "text-foreground"}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}
