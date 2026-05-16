import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { UtensilsCrossed } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

const ADMIN_EMAIL_DOMAIN = "admin.local";

function AuthPage() {
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!authLoading && user) navigate({ to: "/home", replace: true });
  }, [authLoading, navigate, user]);

  // Sign-in fields
  const [siIdentifier, setSiIdentifier] = useState("");
  const [siPassword, setSiPassword] = useState("");

  // Sign-up fields (ทุกคนเริ่มเป็นลูกค้า; เปิดร้านได้ในหน้าโปรไฟล์)
  const [suFirstName, setSuFirstName] = useState("");
  const [suLastName, setSuLastName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPhone, setSuPhone] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suPasswordConfirm, setSuPasswordConfirm] = useState("");

  function translateAuthError(msg: string): string {
    const m = msg.toLowerCase();
    if (
      m.includes("password") &&
      (m.includes("weak") ||
        m.includes("pwned") ||
        m.includes("compromis") ||
        m.includes("breach") ||
        m.includes("found in"))
    ) {
      return "รหัสผ่านนี้ง่ายเกินไปหรือเคยถูกเปิดเผยในเหตุข้อมูลรั่วไหล กรุณาเลือกรหัสผ่านที่ปลอดภัยกว่านี้";
    }
    if (m.includes("password") && m.includes("should be at least")) {
      return "รหัสผ่านสั้นเกินไป กรุณาใช้อย่างน้อย 6 ตัวอักษร";
    }
    if (m.includes("password")) {
      return "รหัสผ่านไม่ผ่านเงื่อนไขความปลอดภัย กรุณาลองใหม่ด้วยรหัสที่ซับซ้อนขึ้น";
    }
    if (m.includes("user already registered") || m.includes("already registered")) {
      return "อีเมลนี้ถูกใช้สมัครไปแล้ว กรุณาเข้าสู่ระบบหรือใช้อีเมลอื่น";
    }
    if (m.includes("invalid") && m.includes("email")) {
      return "รูปแบบอีเมลไม่ถูกต้อง";
    }
    if (m.includes("invalid login")) {
      return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    }
    return msg;
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const raw = siIdentifier.trim();
      // ถ้าไม่มี @ ถือว่าเป็น username (แอดมิน) → แปลงเป็นอีเมลภายใน
      const email = raw.includes("@") ? raw : `${raw.toLowerCase()}@${ADMIN_EMAIL_DOMAIN}`;
      const { error } = await signIn(email, siPassword);
      if (error) return toast.error(translateAuthError(error));
      toast.success("เข้าสู่ระบบสำเร็จ");
      navigate({ to: "/home", replace: true });
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    if (suPassword !== suPasswordConfirm) {
      return toast.error("รหัสผ่านยืนยันไม่ตรงกัน กรุณากรอกใหม่");
    }
    setLoading(true);
    const { error } = await signUp(suEmail, suPassword, suFirstName, suLastName, "customer", suPhone);
    setLoading(false);
    if (error) return toast.error(translateAuthError(error));
    toast.success("สมัครสมาชิกสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี");
    setTab("signin");
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-accent/40 via-background to-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link to="/home" className="flex items-center justify-center gap-2 mb-6">
          <div className="h-12 w-12 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground">
            <UtensilsCrossed className="h-6 w-6" />
          </div>
          <span className="text-2xl font-bold text-foreground">FoodDash</span>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>ยินดีต้อนรับ</CardTitle>
            <CardDescription>เข้าสู่ระบบหรือสมัครสมาชิกเพื่อเริ่มใช้งาน</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as "signin" | "signup")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">เข้าสู่ระบบ</TabsTrigger>
                <TabsTrigger value="signup">สมัครสมาชิก</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="si-id">อีเมล</Label>
                    <Input
                      id="si-id"
                      type="text"
                      required
                      value={siIdentifier}
                      onChange={(e) => setSiIdentifier(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="si-pw">รหัสผ่าน</Label>
                    <Input
                      id="si-pw"
                      type="password"
                      required
                      value={siPassword}
                      onChange={(e) => setSiPassword(e.target.value)}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="su-first">ชื่อ</Label>
                      <Input
                        id="su-first"
                        required
                        value={suFirstName}
                        onChange={(e) => setSuFirstName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="su-last">นามสกุล</Label>
                      <Input
                        id="su-last"
                        required
                        value={suLastName}
                        onChange={(e) => setSuLastName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-email">อีเมล</Label>
                    <Input
                      id="su-email"
                      type="email"
                      required
                      value={suEmail}
                      onChange={(e) => setSuEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-phone">เบอร์โทร</Label>
                    <Input
                      id="su-phone"
                      type="tel"
                      value={suPhone}
                      onChange={(e) => setSuPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-pw">รหัสผ่าน (อย่างน้อย 6 ตัว)</Label>
                    <Input
                      id="su-pw"
                      type="password"
                      minLength={6}
                      required
                      value={suPassword}
                      onChange={(e) => setSuPassword(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-pw2">ยืนยันรหัสผ่าน</Label>
                    <Input
                      id="su-pw2"
                      type="password"
                      minLength={6}
                      required
                      value={suPasswordConfirm}
                      onChange={(e) => setSuPasswordConfirm(e.target.value)}
                    />
                    {suPasswordConfirm && suPassword !== suPasswordConfirm && (
                      <p className="text-xs text-destructive">รหัสผ่านยืนยันไม่ตรงกัน</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    สมัครแล้วใช้สั่งอาหารได้ทันที —
                    อยากเปิดร้านขายของก็เปิดเพิ่มได้ภายหลังในหน้าโปรไฟล์
                  </p>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "กำลังสมัคร..." : "สมัครสมาชิก"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
