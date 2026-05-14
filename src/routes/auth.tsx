import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useAuth, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { UtensilsCrossed } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

const ADMIN_EMAIL_DOMAIN = "admin.local";

function AuthPage() {
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);

  if (user) {
    setTimeout(() => navigate({ to: "/home" }), 0);
  }

  // Sign-in fields
  const [siIdentifier, setSiIdentifier] = useState("");
  const [siPassword, setSiPassword] = useState("");

  // Sign-up fields (no admin option)
  const [suName, setSuName] = useState("");
  const [suEmail, setSuEmail] = useState("");
  const [suPhone, setSuPhone] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suRole, setSuRole] = useState<Exclude<AppRole, "admin">>("customer");

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const email =
      signInMode === "username"
        ? `${siIdentifier.trim().toLowerCase()}@${ADMIN_EMAIL_DOMAIN}`
        : siIdentifier.trim();
    const { error } = await signIn(email, siPassword);
    setLoading(false);
    if (error) return toast.error(error);
    toast.success("เข้าสู่ระบบสำเร็จ");
    navigate({ to: "/home" });
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await signUp(suEmail, suPassword, suName, suRole, suPhone);
    setLoading(false);
    if (error) return toast.error(error);
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
                <div className="flex gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setSignInMode("email")}
                    className={`flex-1 text-xs py-1.5 rounded-md border ${
                      signInMode === "email"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    อีเมล
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignInMode("username")}
                    className={`flex-1 text-xs py-1.5 rounded-md border ${
                      signInMode === "username"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    Username (แอดมิน)
                  </button>
                </div>
                <form onSubmit={handleSignIn} className="space-y-4 pt-3">
                  <div className="space-y-2">
                    <Label htmlFor="si-id">{signInMode === "email" ? "อีเมล" : "Username"}</Label>
                    <Input
                      id="si-id"
                      type={signInMode === "email" ? "email" : "text"}
                      required
                      value={siIdentifier}
                      onChange={(e) => setSiIdentifier(e.target.value)}
                      placeholder={signInMode === "username" ? "adminmai" : ""}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="si-pw">รหัสผ่าน</Label>
                    <Input id="si-pw" type="password" required value={siPassword} onChange={(e) => setSiPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="su-name">ชื่อ-นามสกุล</Label>
                    <Input id="su-name" required value={suName} onChange={(e) => setSuName(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-email">อีเมล</Label>
                    <Input id="su-email" type="email" required value={suEmail} onChange={(e) => setSuEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-phone">เบอร์โทร</Label>
                    <Input id="su-phone" type="tel" value={suPhone} onChange={(e) => setSuPhone(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-pw">รหัสผ่าน (อย่างน้อย 6 ตัว)</Label>
                    <Input id="su-pw" type="password" minLength={6} required value={suPassword} onChange={(e) => setSuPassword(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>ฉันต้องการสมัครเป็น</Label>
                    <RadioGroup value={suRole} onValueChange={(v) => setSuRole(v as Exclude<AppRole, "admin">)} className="grid grid-cols-3 gap-2">
                      <RoleOption value="customer" label="ลูกค้า" desc="สั่งอาหาร" current={suRole} />
                      <RoleOption value="restaurant" label="ร้านอาหาร" desc="ขายอาหาร" current={suRole} />
                      <RoleOption value="rider" label="ไรเดอร์" desc="ส่งอาหาร" current={suRole} />
                    </RadioGroup>
                  </div>
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

function RoleOption({ value, label, desc, current }: { value: string; label: string; desc: string; current: string }) {
  const active = current === value;
  return (
    <Label
      htmlFor={`role-${value}`}
      className={`cursor-pointer rounded-lg border-2 p-3 transition ${
        active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
      }`}
    >
      <RadioGroupItem id={`role-${value}`} value={value} className="sr-only" />
      <div className="font-medium text-foreground">{label}</div>
      <div className="text-xs text-muted-foreground">{desc}</div>
    </Label>
  );
}
