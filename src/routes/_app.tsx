import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { supabase } from "@/integrations/supabase/client";
import { Home, ShoppingBag, ClipboardList, User, Store, Bike, Shield } from "lucide-react";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ensureOrderChannels } from "@/lib/native-notifications";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

const TERMINAL = ["delivered", "cancelled", "payment_rejected"];

function useActiveOrdersCount() {
  const { user, role } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    let cancelled = false;
    async function load() {
      if (!user) return;
      const col = role === "rider" ? "rider_id" : "customer_id";
      const { count: c } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq(col, user.id)
        .not("status", "in", `(${TERMINAL.join(",")})`);
      if (!cancelled) setCount(c ?? 0);
    }
    load();
    const channel = supabase
      .channel("active-orders-badge")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, role]);

  return count;
}

function AppLayout() {
  const { role, loading } = useAuth();
  const location = useLocation();
  const { count } = useCart();
  const activeOrders = useActiveOrdersCount();

  if (loading) return <LoadingScreen />;

  const customerNav = [
    { to: "/home", icon: Home, label: "หน้าแรก" },
    { to: "/cart", icon: ShoppingBag, label: "ตะกร้า", badge: count, badgeTone: "primary" as const },
    { to: "/orders", icon: ClipboardList, label: "ออเดอร์", badge: activeOrders, badgeTone: "warning" as const },
    { to: "/my-restaurant", icon: Store, label: "ร้านของฉัน" },
    { to: "/profile", icon: User, label: "ฉัน" },
  ];

  const restaurantNav = customerNav;

  const riderNav = [
    { to: "/rider-dashboard", icon: Bike, label: "งาน" },
    { to: "/orders", icon: ClipboardList, label: "ประวัติ", badge: activeOrders, badgeTone: "warning" as const },
    { to: "/profile", icon: User, label: "ฉัน" },
  ];

  const adminNav = [
    { to: "/admin", icon: Shield, label: "แดชบอร์ด" },
    { to: "/profile", icon: User, label: "ฉัน" },
  ];

  const nav =
    role === "restaurant"
      ? restaurantNav
      : role === "rider"
        ? riderNav
        : role === "admin"
          ? adminNav
          : customerNav;

  return (
    <div className="min-h-dvh bg-background safe-top safe-pb-nav overflow-x-hidden">
      {/* แถบทึบปิด status bar — กัน content scroll ลอดขึ้นไปใต้แถบแจ้งเตือนระบบ */}
      <div
        aria-hidden
        className="fixed top-0 inset-x-0 z-50 bg-background pointer-events-none"
        style={{ height: "var(--app-safe-top)" }}
      />
      <Outlet />
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border pb-[var(--app-safe-bottom)]">
        <div
          className="mx-auto max-w-2xl grid"
          style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
        >
          {nav.map((item) => {
            const active =
              location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            const it = item as { badge?: number; badgeTone?: "primary" | "warning" };
            const showBadge = !!it.badge && it.badge > 0;
            const badgeClass =
              it.badgeTone === "warning"
                ? "bg-orange-500 text-white"
                : "bg-green-600 text-white";
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex h-[var(--app-nav-height)] flex-col items-center justify-center gap-1 text-xs transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <div className="relative">
                  <item.icon className="h-5 w-5" />
                  {showBadge && (
                    <span
                      className={`absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] flex items-center justify-center font-semibold ${badgeClass}`}
                    >
                      {it.badge}
                    </span>
                  )}
                </div>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
