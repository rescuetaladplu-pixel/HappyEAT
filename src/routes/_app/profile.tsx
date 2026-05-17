import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { LogOut, User, Store, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { isOpenNow, nextOpenLabel, nextCloseAt, formatCloseLabel } from "@/lib/opening-hours";
import { fetchActiveRestaurantId } from "@/lib/active-restaurant";

interface OpeningHours {
  [k: string]: { open: string; close: string; closed: boolean };
}

interface MyRestaurant {
  id: string;
  is_open: boolean;
  is_open_until: string | null;
  opening_hours: OpeningHours;
}

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

const ROLE_LABELS = {
  customer: "ลูกค้า",
  restaurant: "เจ้าของร้าน",
  rider: "ไรเดอร์",
  admin: "แอดมิน",
};

function ProfilePage() {
  const { user, role, signOut, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [upgrading, setUpgrading] = useState(false);
  const [restaurant, setRestaurant] = useState<MyRestaurant | null>(null);
  const hasRestaurant = !!restaurant;

  useEffect(() => {
    if (!user) {
      setRestaurant(null);
      return;
    }
    fetchActiveRestaurantId(user.id).then((rid) =>
      rid
        ? supabase
            .from("restaurants")
            .select("id, is_open, is_open_until, opening_hours")
            .eq("id", rid)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ).then(
        async ({ data }) => {
          const r = (data as MyRestaurant | null) ?? null;
          if (r && r.is_open && !isOpenNow(r.opening_hours)) {
            const extendActive = r.is_open_until && new Date(r.is_open_until) > new Date();
            if (!extendActive) {
              await supabase
                .from("restaurants")
                .update({ is_open: false, is_open_until: null })
                .eq("id", r.id);
              r.is_open = false;
              r.is_open_until = null;
            }
          }
          setRestaurant(r);
        },
        () => { /* ignore */ },
      );
  }, [user]);

  if (authLoading) {
    return (
      <main className="max-w-2xl mx-auto p-4 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  async function toggleOpen(open: boolean) {
    if (!restaurant) return;
    const prev = { is_open: restaurant.is_open, is_open_until: restaurant.is_open_until };
    if (!open) {
      setRestaurant({ ...restaurant, is_open: false, is_open_until: null });
      const { error } = await supabase
        .from("restaurants")
        .update({ is_open: false, is_open_until: null })
        .eq("id", restaurant.id);
      if (error) {
        setRestaurant({ ...restaurant, ...prev });
        return toast.error(error.message);
      }
      toast.success("ปิดร้านชั่วคราว");
      return;
    }
    const closeAt = nextCloseAt(restaurant.opening_hours);
    const closeIso = closeAt ? closeAt.toISOString() : null;
    setRestaurant({ ...restaurant, is_open: true, is_open_until: closeIso });
    const { error } = await supabase
      .from("restaurants")
      .update({ is_open: true, is_open_until: closeIso })
      .eq("id", restaurant.id);
    if (error) {
      setRestaurant({ ...restaurant, ...prev });
      return toast.error(error.message);
    }
    const withinHours = isOpenNow(restaurant.opening_hours);
    if (!withinHours && closeAt) {
      toast.success("เปิดร้านนอกเวลาทำการ", {
        description: `ร้านจะออนไลน์ยาวจนถึงเวลาปิดอัตโนมัติ: ${formatCloseLabel(closeAt)}`,
        duration: 6000,
      });
    } else {
      toast.success("เปิดร้านแล้ว — พร้อมรับออเดอร์");
    }
  }

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/home" });
  }

  async function becomeRestaurant() {
    if (!user) return;
    setUpgrading(true);
    const { error } = await supabase
      .from("user_roles")
      .insert({ user_id: user.id, role: "restaurant" });
    setUpgrading(false);
    if (error && !error.message.includes("duplicate")) {
      return toast.error(error.message);
    }
    toast.success("เปิดใช้งานบัญชีร้านอาหารแล้ว — กำลังพาไปสร้างร้าน");
    // Reload to refresh role
    window.location.href = "/my-restaurant";
  }

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">โปรไฟล์</h1>

      <Card className="p-5 flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <User className="h-8 w-8" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{user?.email ?? "ยังไม่ได้เข้าสู่ระบบ"}</p>
          <p className="text-sm text-muted-foreground">{role ? ROLE_LABELS[role] : "—"}</p>
        </div>
      </Card>

      {(role === "restaurant" || role === "admin" || hasRestaurant) && (
        <Card className="overflow-hidden">
          <Link
            to="/my-restaurant"
            className="p-5 flex items-center gap-4 hover:bg-accent transition-colors cursor-pointer"
          >
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Store className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">ร้านค้าของฉัน</p>
              <p className="text-sm text-muted-foreground">จัดการโปรไฟล์ร้าน เมนู และออเดอร์</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>

          {restaurant && (() => {
            const withinHours = isOpenNow(restaurant.opening_hours);
            const extendUntil = restaurant.is_open_until ? new Date(restaurant.is_open_until) : null;
            const extendActive = !!(extendUntil && extendUntil > new Date());
            const reallyOpen = restaurant.is_open && (withinHours || extendActive);
            const nextLabel = nextOpenLabel(restaurant.opening_hours);
            const title = !restaurant.is_open
              ? "สถานะร้าน: ออฟไลน์"
              : extendActive && !withinHours
                ? `ออนไลน์นอกเวลา – ปิดอัตโนมัติ ${formatCloseLabel(extendUntil!)}`
                : !withinHours
                  ? `นอกเวลาทำการ${nextLabel ? ` – ${nextLabel}` : ""}`
                  : "สถานะร้าน: ออนไลน์";
            const subtitle = !restaurant.is_open
              ? "ปิดรับออเดอร์ชั่วคราว"
              : extendActive && !withinHours
                ? "ระบบจะปิดอัตโนมัติเมื่อถึงเวลาปิด"
                : !withinHours
                  ? "ร้านจะรับออเดอร์อัตโนมัติเมื่อถึงเวลาทำการ"
                  : "พร้อมรับออเดอร์";
            return (
              <div className="border-t px-5 py-3 flex items-center gap-3 bg-muted/30">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  {reallyOpen && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                      reallyOpen ? "bg-green-500" : "bg-muted-foreground"
                    }`}
                  />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">{title}</p>
                  <p className="text-xs text-muted-foreground leading-tight">{subtitle}</p>
                </div>
                <Switch checked={restaurant.is_open} onCheckedChange={toggleOpen} />
              </div>
            );
          })()}
        </Card>
      )}

      {role === "customer" && user && !hasRestaurant && (
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-3">
            <Store className="h-6 w-6 text-primary" />
            <div className="flex-1">
              <p className="font-semibold">เปิดร้านอาหารกับเรา</p>
              <p className="text-sm text-muted-foreground">เริ่มขายอาหารให้ลูกค้าใกล้คุณ</p>
            </div>
          </div>
          <Button onClick={becomeRestaurant} disabled={upgrading} className="w-full">
            {upgrading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            สมัครเป็นเจ้าของร้าน
          </Button>
        </Card>
      )}

      {user ? (
        <Button variant="outline" className="w-full" onClick={handleSignOut}>
          <LogOut className="h-4 w-4 mr-2" /> ออกจากระบบ
        </Button>
      ) : (
        <Link to="/auth">
          <Button className="w-full">เข้าสู่ระบบ / สมัครสมาชิก</Button>
        </Link>
      )}
    </main>
  );
}
