import { createFileRoute, Outlet, Link, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { Home, ShoppingBag, ClipboardList, User, Store, Bike, Shield } from "lucide-react";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { role } = useAuth();
  const location = useLocation();
  const { count } = useCart();

  const customerNav = [
    { to: "/home", icon: Home, label: "หน้าแรก" },
    { to: "/cart", icon: ShoppingBag, label: "ตะกร้า", badge: count },
    { to: "/orders", icon: ClipboardList, label: "ออเดอร์" },
    { to: "/profile", icon: User, label: "ฉัน" },
  ];

  const restaurantNav = [
    { to: "/restaurant-dashboard", icon: Store, label: "ร้านของฉัน" },
    { to: "/orders", icon: ClipboardList, label: "ออเดอร์" },
    { to: "/profile", icon: User, label: "ฉัน" },
  ];

  const riderNav = [
    { to: "/rider-dashboard", icon: Bike, label: "งาน" },
    { to: "/orders", icon: ClipboardList, label: "ประวัติ" },
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
    <div className="min-h-screen bg-background pb-20">
      <Outlet />
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border">
        <div
          className="mx-auto max-w-2xl grid"
          style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
        >
          {nav.map((item) => {
            const active =
              location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <div className="relative">
                  <item.icon className="h-5 w-5" />
                  {"badge" in item && (item as { badge?: number }).badge ? (
                    <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-semibold">
                      {(item as { badge?: number }).badge}
                    </span>
                  ) : null}
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
