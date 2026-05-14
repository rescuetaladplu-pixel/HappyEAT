import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Shield } from "lucide-react";

export const Route = createFileRoute("/_app/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { role } = useAuth();
  const [stats, setStats] = useState({ orders: 0, restaurants: 0, riders: 0 });

  useEffect(() => {
    async function load() {
      const [o, r, ri] = await Promise.all([
        supabase.from("orders").select("id", { count: "exact", head: true }),
        supabase.from("restaurants").select("id", { count: "exact", head: true }),
        supabase.from("riders").select("id", { count: "exact", head: true }),
      ]);
      setStats({
        orders: o.count ?? 0,
        restaurants: r.count ?? 0,
        riders: ri.count ?? 0,
      });
    }
    if (role === "admin") load();
  }, [role]);

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
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">
          ฟีเจอร์เพิ่มเติม (อนุมัติร้าน, ระงับผู้ใช้, จัดการค่าคอม) จะเพิ่มในเวอร์ชันถัดไป
        </p>
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
