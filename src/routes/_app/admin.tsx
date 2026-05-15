import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, UserPlus, Users, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { createAdminAccount, listAdmins, listAllUsers } from "@/lib/admin.functions";

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
  restaurant: "เจ้าของร้าน",
  rider: "ไรเดอร์",
  admin: "แอดมิน",
};

function AdminPage() {
  const { role } = useAuth();
  const [stats, setStats] = useState({ orders: 0, restaurants: 0, riders: 0 });
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const createFn = useServerFn(createAdminAccount);
  const listFn = useServerFn(listAdmins);
  const listUsersFn = useServerFn(listAllUsers);

  async function loadAdmins() {
    try {
      const rows = await listFn();
      setAdmins(rows as AdminRow[]);
    } catch (e: any) {
      console.error(e);
    }
  }

  useEffect(() => {
    if (role !== "admin") return;
    (async () => {
      const [o, r, ri] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("restaurants").select("id", { count: "exact", head: true }),
        supabase.from("riders").select("id", { count: "exact", head: true }),
      ]);
      setStats({ orders: o.count ?? 0, restaurants: r.count ?? 0, riders: ri.count ?? 0 });
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
    <main className="max-w-2xl mx-auto p-4 space-y-4">
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
