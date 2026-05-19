import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ChevronRight, MapPin, KeyRound, Volume2, ArrowLeft, Loader2 } from "lucide-react";
import { AppVersionCard } from "@/components/AppVersionCard";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [hasRestaurant, setHasRestaurant] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("id")
        .eq("owner_id", user.id)
        .limit(1);
      setHasRestaurant((data?.length ?? 0) > 0);
    })().catch(() => { /* ignore */ });
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/auth", replace: true });
    }
  }, [authLoading, user, navigate]);

  if (authLoading || !user) {
    return (
      <main className="max-w-2xl mx-auto p-4 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const showRestaurantSound = role === "restaurant" || role === "admin" || hasRestaurant;

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Link
          to="/profile"
          className="h-9 w-9 rounded-full hover:bg-accent flex items-center justify-center"
          aria-label="ย้อนกลับ"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">ตั้งค่า</h1>
      </div>

      <Card className="overflow-hidden divide-y">
        <Link
          to="/addresses"
          search={{ from: "/settings" }}
          className="p-4 flex items-center gap-3 hover:bg-accent transition-colors"
        >
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <MapPin className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium">ที่อยู่จัดส่ง</p>
            <p className="text-xs text-muted-foreground">เพิ่ม/แก้ไข และตั้งค่าที่อยู่เริ่มต้น</p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Link>

        {showRestaurantSound && (
          <Link
            to="/restaurant/notification-settings"
            className="p-4 flex items-center gap-3 hover:bg-accent transition-colors"
          >
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Volume2 className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">เสียงแจ้งเตือนออเดอร์</p>
              <p className="text-xs text-muted-foreground">เลือกเสียงและความดังสำหรับออเดอร์ใหม่</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        )}

        <Link
          to="/profile/edit"
          hash="password"
          className="p-4 flex items-center gap-3 hover:bg-accent transition-colors"
        >
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <KeyRound className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium">เปลี่ยนรหัสผ่าน</p>
            <p className="text-xs text-muted-foreground">ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ</p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Link>
      </Card>

      <AppVersionCard />
    </main>
  );
}
