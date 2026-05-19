import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Shield, ChevronLeft, Smartphone, Bike, AlertTriangle, Plus, Eye } from "lucide-react";
import { toast } from "sonner";
import happyEatLogo from "@/assets/happyeat-logo.png";
import happyRiderLogo from "@/assets/happyrider-logo.png";

const PLATFORM_LOGOS: Record<string, string> = {
  android: happyEatLogo,
  ios: happyEatLogo,
  android_rider: happyRiderLogo,
};
import { compareVersions } from "@/lib/app-version";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_app/admin/app-version")({
  component: AppVersionAdmin,
});

type AppConfigRow = {
  id: string;
  platform: string;
  latest_version: string;
  min_supported_version: string;
  apk_download_url: string | null;
  release_notes: string | null;
  force_update: boolean;
  updated_at: string;
};

const PLATFORM_LABELS: Record<string, { label: string; icon: typeof Smartphone; desc: string }> = {
  android: { label: "ลูกค้า / ร้านค้า (Android)", icon: Smartphone, desc: "แอป HappyEat สำหรับลูกค้าและร้าน" },
  android_rider: { label: "ไรเดอร์ (Android)", icon: Bike, desc: "แอป HappyRider สำหรับไรเดอร์" },
  ios: { label: "ลูกค้า / ร้านค้า (iOS)", icon: Smartphone, desc: "แอป iOS (ถ้ามี)" },
};

function AppVersionAdmin() {
  const { role } = useAuth();
  const [rows, setRows] = useState<AppConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingPlatform, setAddingPlatform] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("app_config")
      .select("*")
      .order("platform", { ascending: true });
    if (error) toast.error(error.message);
    setRows((data ?? []) as AppConfigRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (role === "admin") void load();
  }, [role]);

  if (role !== "admin") {
    return (
      <main className="p-6 text-center">
        <Shield className="mx-auto mb-2 h-12 w-12 opacity-30" />
        <p className="text-muted-foreground">เฉพาะแอดมินเท่านั้น</p>
      </main>
    );
  }

  const existingPlatforms = new Set(rows.map((r) => r.platform));
  const missingPlatforms = Object.keys(PLATFORM_LABELS).filter((p) => !existingPlatforms.has(p));

  async function handleAddPlatform(platform: string) {
    setAddingPlatform(true);
    const { error } = await supabase.from("app_config").insert({
      platform,
      latest_version: "1.0.0",
      min_supported_version: "1.0.0",
      force_update: false,
    });
    setAddingPlatform(false);
    if (error) return toast.error(error.message);
    toast.success(`เพิ่ม ${platform} แล้ว`);
    load();
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <div className="flex items-center gap-2">
        <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="inline h-4 w-4" /> กลับ
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">จัดการเวอร์ชันแอป</h1>
        <p className="text-sm text-muted-foreground">
          ปล่อยเวอร์ชันใหม่ของ APK และบังคับให้ผู้ใช้อัปเดต
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <PlatformCard key={row.id} row={row} onSaved={load} />
          ))}
        </div>
      )}

      {missingPlatforms.length > 0 && (
        <Card className="space-y-3 p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Plus className="h-4 w-4" /> เพิ่มแพลตฟอร์ม
          </h2>
          <div className="flex flex-wrap gap-2">
            {missingPlatforms.map((p) => (
              <Button
                key={p}
                size="sm"
                variant="outline"
                disabled={addingPlatform}
                onClick={() => handleAddPlatform(p)}
              >
                + {PLATFORM_LABELS[p]?.label ?? p}
              </Button>
            ))}
          </div>
        </Card>
      )}
    </main>
  );
}

function PlatformCard({ row, onSaved }: { row: AppConfigRow; onSaved: () => void }) {
  const meta = PLATFORM_LABELS[row.platform] ?? {
    label: row.platform,
    icon: Smartphone,
    desc: "",
  };
  const Icon = meta.icon;

  const [latest, setLatest] = useState(row.latest_version);
  const [minSupported, setMinSupported] = useState(row.min_supported_version);
  const [url, setUrl] = useState(row.apk_download_url ?? "");
  const [notes, setNotes] = useState(row.release_notes ?? "");
  const [forceUpdate, setForceUpdate] = useState(row.force_update);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const versionRegex = /^\d+\.\d+(\.\d+)?$/;
  const latestValid = versionRegex.test(latest);
  const minValid = versionRegex.test(minSupported);
  const versionWarning =
    latestValid && compareVersions(latest, row.latest_version) < 0
      ? `เวอร์ชันใหม่ (${latest}) ต่ำกว่าเวอร์ชันปัจจุบัน (${row.latest_version})`
      : null;
  const minWarning =
    latestValid && minValid && compareVersions(minSupported, latest) > 0
      ? "เวอร์ชันต่ำสุดที่รองรับห้ามสูงกว่าเวอร์ชันล่าสุด"
      : null;

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!latestValid || !minValid) {
      toast.error("รูปแบบเวอร์ชันต้องเป็น x.y.z เช่น 1.0.1");
      return;
    }
    if (minWarning) {
      toast.error(minWarning);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("app_config")
      .update({
        latest_version: latest.trim(),
        min_supported_version: minSupported.trim(),
        apk_download_url: url.trim() || null,
        release_notes: notes.trim() || null,
        force_update: forceUpdate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("บันทึกเรียบร้อย");
    onSaved();
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-14 w-14 shrink-0 rounded-lg bg-muted/50 p-1.5 flex items-center justify-center overflow-hidden">
            {PLATFORM_LOGOS[row.platform] ? (
              <img
                src={PLATFORM_LOGOS[row.platform]}
                alt={meta.label}
                className="h-full w-full object-contain"
              />
            ) : (
              <Icon className="h-6 w-6 text-primary" />
            )}
          </div>
          <div>
            <h3 className="font-semibold flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              {meta.label}
            </h3>
            <p className="text-xs text-muted-foreground">{meta.desc}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-bold text-primary">{row.latest_version}</p>
          <p className="text-[10px] text-muted-foreground">
            อัปเดต {new Date(row.updated_at).toLocaleString("th-TH")}
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>เวอร์ชันล่าสุด *</Label>
            <Input
              value={latest}
              onChange={(e) => setLatest(e.target.value)}
              placeholder="1.0.1"
              className={!latestValid ? "border-destructive" : ""}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>เวอร์ชันต่ำสุดที่รองรับ *</Label>
            <Input
              value={minSupported}
              onChange={(e) => setMinSupported(e.target.value)}
              placeholder="1.0.0"
              className={!minValid ? "border-destructive" : ""}
              required
            />
          </div>
        </div>
        {versionWarning && (
          <p className="flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle className="h-3 w-3" /> {versionWarning}
          </p>
        )}
        {minWarning && (
          <p className="flex items-center gap-1 text-xs text-destructive">
            <AlertTriangle className="h-3 w-3" /> {minWarning}
          </p>
        )}

        <div className="space-y-1.5">
          <Label>ลิงก์ดาวน์โหลด APK</Label>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://...apk"
            type="url"
          />
        </div>

        <div className="space-y-1.5">
          <Label>มีอะไรใหม่ (Release notes)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="- แก้บั๊ก...&#10;- เพิ่มฟีเจอร์..."
            rows={3}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">บังคับอัปเดตทันที</p>
            <p className="text-xs text-muted-foreground">
              เปิด = ผู้ใช้ทุกคนต้องอัปเดตก่อนใช้งาน (แม้เวอร์ชันยังใหม่กว่า min)
            </p>
          </div>
          <Switch checked={forceUpdate} onCheckedChange={setForceUpdate} />
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? "กำลังบันทึก..." : "ปล่อยเวอร์ชันใหม่"}
          </Button>
          <Button type="button" variant="outline" onClick={() => setPreview(true)}>
            <Eye className="h-4 w-4" /> Preview
          </Button>
        </div>
      </form>

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <AlertTriangle className="h-7 w-7 text-primary" />
            </div>
            <DialogTitle className="text-center text-xl">มีเวอร์ชันใหม่ของ HappyEat</DialogTitle>
            <DialogDescription className="text-center">
              กรุณาอัปเดตแอปก่อนใช้งานต่อ
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg bg-muted p-3">
              <span className="text-muted-foreground">เวอร์ชันของคุณ</span>
              <span className="font-mono font-semibold">1.0.0</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-primary/10 p-3">
              <span className="text-muted-foreground">เวอร์ชันล่าสุด</span>
              <span className="font-mono font-semibold text-primary">{latest}</span>
            </div>
            {notes && (
              <div className="rounded-lg border p-3">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">มีอะไรใหม่</p>
                <p className="whitespace-pre-line text-sm">{notes}</p>
              </div>
            )}
          </div>
          <Button size="lg" className="mt-2 w-full gap-2" disabled>
            <Download className="h-5 w-5" />
            ดาวน์โหลดเวอร์ชันใหม่
          </Button>
          <p className="text-center text-xs text-muted-foreground">ตัวอย่างเท่านั้น</p>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
