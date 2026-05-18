import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Shield, ChevronLeft, MailCheck, KeyRound, User } from "lucide-react";
import { toast } from "sonner";
import {
  getUserDetailForAdmin,
  confirmUserEmail,
  resetUserPassword,
  deleteUserAccount,
} from "@/lib/admin.functions";
import { STATUS_LABELS, STATUS_VARIANTS, type OrderStatus } from "@/lib/order-status";

export const Route = createFileRoute("/_app/admin/users/$userId")({
  component: AdminUserDetail,
});

const ROLE_LABEL: Record<string, string> = {
  customer: "ลูกค้า",
  restaurant: "ร้านค้า",
  rider: "ไรเดอร์",
  admin: "แอดมิน",
};

function AdminUserDetail() {
  const { role } = useAuth();
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const detailFn = useServerFn(getUserDetailForAdmin);
  const confirmFn = useServerFn(confirmUserEmail);
  const resetFn = useServerFn(resetUserPassword);
  const deleteFn = useServerFn(deleteUserAccount);

  async function load() {
    setLoading(true);
    try {
      setData(await detailFn({ data: { userId } }));
    } catch (e: any) {
      toast.error(e?.message ?? "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (role !== "admin") return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, userId]);

  if (role !== "admin") {
    return (
      <main className="p-6 text-center">
        <Shield className="h-12 w-12 mx-auto opacity-30 mb-2" />
        <p className="text-muted-foreground">เฉพาะแอดมินเท่านั้น</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="max-w-3xl mx-auto p-4">
        <p className="text-sm text-muted-foreground">{loading ? "กำลังโหลด..." : "ไม่พบข้อมูล"}</p>
      </main>
    );
  }

  const { user, profile, roles, restaurants, orders, addresses, rider } = data;
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "—";

  async function handleConfirm() {
    try {
      await confirmFn({ data: { userId } });
      toast.success("ยืนยันอีเมลแล้ว");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "ไม่สำเร็จ");
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();
    setSavingPw(true);
    try {
      await resetFn({ data: { userId, password: newPw } });
      toast.success("ตั้งรหัสผ่านใหม่แล้ว");
      setPwOpen(false);
      setNewPw("");
    } catch (e: any) {
      toast.error(e?.message ?? "ไม่สำเร็จ");
    } finally {
      setSavingPw(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`ลบบัญชี ${user.email ?? fullName} ถาวร?`)) return;
    try {
      await deleteFn({ data: { userId } });
      toast.success("ลบบัญชีแล้ว");
      navigate({ to: "/admin" });
    } catch (e: any) {
      toast.error(e?.message ?? "ไม่สำเร็จ");
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-4">
      <button
        onClick={() => window.history.back()}
        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
      >
        <ChevronLeft className="h-4 w-4" /> กลับ
      </button>

      <div className="flex items-start gap-3">
        <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
          <User className="h-7 w-7 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold">{fullName}</h1>
          <p className="text-sm text-muted-foreground break-all">{user.email ?? "—"}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {roles.map((r: string) => (
              <Badge key={r} variant="secondary" className="text-xs">
                {ROLE_LABEL[r] ?? r}
              </Badge>
            ))}
            {!user.email_confirmed && user.email && (
              <Badge className="text-xs bg-amber-500">ยังไม่ยืนยันอีเมล</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!user.email_confirmed && user.email && (
          <Button size="sm" variant="outline" onClick={handleConfirm}>
            <MailCheck className="h-3.5 w-3.5 mr-1" /> ยืนยันอีเมล
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => { setNewPw(""); setPwOpen(true); }}>
          <KeyRound className="h-3.5 w-3.5 mr-1" /> ตั้งรหัสผ่านใหม่
        </Button>
        {!roles.includes("admin") && (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={handleDelete}>
            ลบบัญชี
          </Button>
        )}
      </div>

      <Card className="p-4 space-y-1 text-sm">
        <h3 className="font-semibold mb-1">ข้อมูลโปรไฟล์</h3>
        <Row label="username" value={profile?.username ?? "—"} />
        <Row label="เบอร์" value={profile?.phone ?? "—"} />
        <Row label="สมัครเมื่อ" value={new Date(user.created_at).toLocaleString("th-TH")} />
        <Row label="เข้าครั้งสุดท้าย" value={user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString("th-TH") : "—"} />
      </Card>

      {rider && (
        <Card className="p-4 space-y-1 text-sm">
          <h3 className="font-semibold mb-1">ข้อมูลไรเดอร์</h3>
          <Row label="อนุมัติ" value={rider.is_approved ? "✓" : "—"} />
          <Row label="ออนไลน์" value={rider.is_online ? "✓" : "—"} />
          <Row label="ยานพาหนะ" value={rider.vehicle_type ?? "—"} />
          <Row label="ทะเบียน" value={rider.license_plate ?? "—"} />
          <Row label="คะแนน" value={String(rider.rating ?? 0)} />
        </Card>
      )}

      {restaurants.length > 0 && (
        <Card className="p-4 space-y-2 text-sm">
          <h3 className="font-semibold">ร้านที่เป็นเจ้าของ ({restaurants.length})</h3>
          {restaurants.map((r: any) => (
            <div key={r.id} className="border-b last:border-0 py-2">
              <p className="font-medium">{r.name}</p>
              <p className="text-xs text-muted-foreground">
                {r.is_approved ? "อนุมัติแล้ว" : "รออนุมัติ"} · {r.is_open ? "เปิด" : "ปิด"} · {r.category ?? "—"}
              </p>
            </div>
          ))}
        </Card>
      )}

      {addresses.length > 0 && (
        <Card className="p-4 space-y-2 text-sm">
          <h3 className="font-semibold">ที่อยู่ ({addresses.length})</h3>
          {addresses.map((a: any) => (
            <div key={a.id} className="border-b last:border-0 py-2">
              <p className="font-medium">
                {a.label} {a.is_default && <Badge variant="outline" className="text-xs ml-1">ค่าตั้งต้น</Badge>}
              </p>
              <p className="text-xs text-muted-foreground">{a.address}</p>
              <p className="text-xs text-muted-foreground">{a.contact_name ?? "—"} · {a.phone_primary ?? "—"}</p>
            </div>
          ))}
        </Card>
      )}

      <Card className="p-4 space-y-2 text-sm">
        <h3 className="font-semibold">ออเดอร์ที่เกี่ยวข้อง ({orders.length})</h3>
        {orders.length === 0 && <p className="text-muted-foreground text-xs">ยังไม่มี</p>}
        {orders.map((o: any) => (
          <Link
            key={o.id}
            to="/admin/orders/$orderId"
            params={{ orderId: o.id }}
            className="flex justify-between items-center border-b last:border-0 py-2 hover:bg-muted/40 -mx-2 px-2 rounded"
          >
            <div className="min-w-0">
              <p className="font-medium truncate">{o.restaurants?.name ?? "—"}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(o.created_at).toLocaleString("th-TH")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANTS[o.status as OrderStatus] ?? "secondary"} className="text-xs">
                {STATUS_LABELS[o.status as OrderStatus] ?? o.status}
              </Badge>
              <span className="font-semibold text-primary">฿{Number(o.total).toFixed(0)}</span>
            </div>
          </Link>
        ))}
      </Card>

      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ตั้งรหัสผ่านใหม่</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-3">
            <Label htmlFor="pw">รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</Label>
            <Input id="pw" type="text" value={newPw} onChange={(e) => setNewPw(e.target.value)} minLength={6} required autoFocus />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPwOpen(false)}>ยกเลิก</Button>
              <Button type="submit" disabled={savingPw}>{savingPw ? "กำลังบันทึก..." : "บันทึก"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
