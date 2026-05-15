import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, TrendingUp, Receipt, ShoppingBag, XCircle } from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/_app/restaurant/analytics")({
  component: AnalyticsPage,
});

const RANGES = [
  { key: "today", label: "วันนี้", days: 1 },
  { key: "7d", label: "7 วัน", days: 7 },
  { key: "30d", label: "30 วัน", days: 30 },
];

interface OrderRow {
  id: string;
  status: string;
  total: number;
  created_at: string;
  order_items: { name: string; price: number; quantity: number }[];
}

const COLORS = ["hsl(var(--primary))", "#22c55e", "#f59e0b", "#ef4444", "#6366f1", "#06b6d4", "#a855f7"];

function AnalyticsPage() {
  const { user } = useAuth();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [range, setRange] = useState("7d");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase.from("restaurants").select("id").eq("owner_id", user.id).maybeSingle()
      .then(({ data }) => setRestaurantId(data?.id ?? null));
  }, [user]);

  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);
    const days = RANGES.find((r) => r.key === range)?.days ?? 7;
    const since = new Date();
    if (days === 1) since.setHours(0, 0, 0, 0);
    else since.setDate(since.getDate() - days);

    supabase.from("orders")
      .select("id, status, total, created_at, order_items(name, price, quantity)")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", since.toISOString())
      .then(({ data }) => {
        setOrders((data ?? []) as unknown as OrderRow[]);
        setLoading(false);
      });
  }, [restaurantId, range]);

  const stats = useMemo(() => {
    const delivered = orders.filter((o) => o.status === "delivered");
    const cancelled = orders.filter((o) => o.status === "cancelled");
    const revenue = delivered.reduce((s, o) => s + Number(o.total), 0);
    const aov = delivered.length ? revenue / delivered.length : 0;
    const cancelRate = orders.length ? (cancelled.length / orders.length) * 100 : 0;
    return { revenue, count: delivered.length, total: orders.length, aov, cancelRate };
  }, [orders]);

  const dailyData = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) {
      if (o.status !== "delivered") continue;
      const d = new Date(o.created_at).toISOString().slice(0, 10);
      m.set(d, (m.get(d) ?? 0) + Number(o.total));
    }
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, revenue]) => ({
        date: date.slice(5),
        revenue: Math.round(revenue),
      }));
  }, [orders]);

  const topItems = useMemo(() => {
    const m = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const o of orders) {
      if (o.status !== "delivered") continue;
      for (const it of o.order_items ?? []) {
        const cur = m.get(it.name) ?? { name: it.name, qty: 0, revenue: 0 };
        cur.qty += it.quantity;
        cur.revenue += Number(it.price) * it.quantity;
        m.set(it.name, cur);
      }
    }
    return Array.from(m.values()).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [orders]);

  const statusData = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) m.set(o.status, (m.get(o.status) ?? 0) + 1);
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [orders]);

  return (
    <main className="max-w-4xl mx-auto p-4 pb-24 space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm"><Link to="/restaurant-dashboard"><ArrowLeft className="h-4 w-4 mr-1" />หน้าร้าน</Link></Button>
      </div>

      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-bold">สรุปยอดขาย</h1>
      </div>

      <Tabs value={range} onValueChange={setRange}>
        <TabsList>
          {RANGES.map((r) => <TabsTrigger key={r.key} value={r.key}>{r.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<Receipt />} label="ยอดขาย" value={`฿${stats.revenue.toLocaleString()}`} />
            <StatCard icon={<ShoppingBag />} label="ออเดอร์สำเร็จ" value={stats.count.toString()} />
            <StatCard icon={<TrendingUp />} label="มูลค่าเฉลี่ย/ออเดอร์" value={`฿${Math.round(stats.aov).toLocaleString()}`} />
            <StatCard icon={<XCircle />} label="อัตรายกเลิก" value={`${stats.cancelRate.toFixed(1)}%`} />
          </div>

          <Card className="p-4">
            <h2 className="font-semibold mb-3">ยอดขายรายวัน</h2>
            {dailyData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">ยังไม่มีข้อมูล</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold mb-3">เมนูขายดี Top 10</h2>
            {topItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">ยังไม่มีข้อมูล</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, topItems.length * 32)}>
                <BarChart data={topItems} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={120} />
                  <Tooltip />
                  <Bar dataKey="qty" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold mb-3">สัดส่วนสถานะออเดอร์</h2>
            {statusData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">ยังไม่มีข้อมูล</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={80} label>
                    {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </>
      )}
    </main>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        {label}
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </Card>
  );
}
