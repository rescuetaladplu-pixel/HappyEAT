import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogOut, User, Store, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [upgrading, setUpgrading] = useState(false);
  const [hasRestaurant, setHasRestaurant] = useState(false);

  useEffect(() => {
    if (!user) {
      setHasRestaurant(false);
      return;
    }
    supabase
      .from("restaurants")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle()
      .then(({ data }) => setHasRestaurant(!!data));
  }, [user]);

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
        <Link to="/my-restaurant">
          <Card className="p-5 flex items-center gap-4 hover:bg-accent transition-colors cursor-pointer">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Store className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold">ร้านค้าของฉัน</p>
              <p className="text-sm text-muted-foreground">จัดการโปรไฟล์ร้าน เมนู และออเดอร์</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Card>
        </Link>
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
