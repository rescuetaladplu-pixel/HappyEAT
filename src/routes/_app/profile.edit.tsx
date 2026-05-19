import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Loader2, Save, Upload, User } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/profile/edit")({
  component: EditProfilePage,
});

function EditProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name, phone, username, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setFirstName(data.first_name ?? "");
        setLastName(data.last_name ?? "");
        setPhone(data.phone ?? "");
        setUsername(data.username ?? "");
        setAvatarUrl(data.avatar_url ?? null);
      }
      setLoading(false);
    })().catch(() => setLoading(false));
  }, [user]);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("restaurant-images")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("restaurant-images").getPublicUrl(path);
      setAvatarUrl(pub.publicUrl);
      toast.success("อัปโหลดรูปแล้ว — กดบันทึกเพื่อยืนยัน");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        username: username.trim() || null,
        avatar_url: avatarUrl,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("บันทึกโปรไฟล์แล้ว");
    navigate({ to: "/profile" });
  }

  if (!user) {
    return (
      <main className="max-w-2xl mx-auto p-4">
        <p>กรุณาเข้าสู่ระบบ</p>
        <Link to="/auth"><Button className="mt-3">เข้าสู่ระบบ</Button></Link>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto p-4 flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/profile" })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">แก้ไขโปรไฟล์</h1>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            {avatarUrl ? <AvatarImage src={avatarUrl} /> : null}
            <AvatarFallback><User className="h-8 w-8" /></AvatarFallback>
          </Avatar>
          <div>
            <Label htmlFor="avatar" className="cursor-pointer">
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background hover:bg-accent text-sm">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                เปลี่ยนรูปโปรไฟล์
              </div>
              <input id="avatar" type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
            </Label>
          </div>
        </div>

        <div className="space-y-2">
          <Label>อีเมล</Label>
          <Input value={user.email ?? ""} disabled />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="first">ชื่อ</Label>
            <Input id="first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last">นามสกุล</Label>
            <Input id="last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">เบอร์โทรศัพท์</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="username">ชื่อผู้ใช้ (ไม่บังคับ)</Label>
          <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        บันทึก
      </Button>
    </main>
  );
}
