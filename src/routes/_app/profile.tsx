import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LogOut, User } from "lucide-react";

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

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/home" });
  }

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">โปรไฟล์</h1>
      <Card className="p-5 flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <User className="h-8 w-8" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold truncate">{user?.email}</p>
          <p className="text-sm text-muted-foreground">
            {role ? ROLE_LABELS[role] : "—"}
          </p>
        </div>
      </Card>

      <Button variant="outline" className="w-full" onClick={handleSignOut}>
        <LogOut className="h-4 w-4 mr-2" /> ออกจากระบบ
      </Button>
    </main>
  );
}
