import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { supabase } from "@/integrations/supabase/client";
import { APP_VERSION, compareVersions } from "@/lib/app-version";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Smartphone, Download, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { downloadAndInstallApk } from "@/lib/apk-updater";

export function AppVersionCard() {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentVersion, setCurrentVersion] = useState<string>(APP_VERSION);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [apkUrl, setApkUrl] = useState<string | null>(null);
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  async function loadVersion() {
    setChecking(true);
    try {
      if (isNative) {
        try {
          const info = await CapApp.getInfo();
          setCurrentVersion(info.version || APP_VERSION);
        } catch { /* ignore */ }
      }
      const platform = isNative ? Capacitor.getPlatform() : "android";
      const { data } = await supabase
        .from("app_config")
        .select("latest_version, apk_download_url, release_notes")
        .eq("platform", platform)
        .maybeSingle();
      if (data) {
        setLatestVersion(data.latest_version);
        setApkUrl(data.apk_download_url);
        setReleaseNotes(data.release_notes);
      }
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    void loadVersion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasUpdate = latestVersion ? compareVersions(currentVersion, latestVersion) < 0 : false;

  async function handleDownload() {
    if (!apkUrl) return;
    try {
      await Browser.open({ url: apkUrl });
    } catch {
      window.open(apkUrl, "_blank");
    }
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold">เวอร์ชันแอป</p>
          <p className="text-xs text-muted-foreground">
            ปัจจุบัน <span className="font-mono">{currentVersion}</span>
            {latestVersion && (
              <> · ล่าสุด <span className="font-mono">{latestVersion}</span></>
            )}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { void loadVersion(); toast.success("ตรวจสอบเรียบร้อย"); }} disabled={checking}>
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : "ตรวจสอบ"}
        </Button>
      </div>

      {hasUpdate ? (
        <>
          {releaseNotes && (
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="mb-1 text-xs font-semibold text-muted-foreground">มีอะไรใหม่</p>
              <p className="whitespace-pre-line">{releaseNotes}</p>
            </div>
          )}
          <Button onClick={handleDownload} disabled={!apkUrl} className="w-full gap-2">
            <Download className="h-4 w-4" /> ดาวน์โหลดเวอร์ชันใหม่ ({latestVersion})
          </Button>
          {!isNative && (
            <p className="text-xs text-muted-foreground text-center">
              เปิดลิงก์บนมือถือ Android เพื่อติดตั้ง APK
            </p>
          )}
        </>
      ) : (
        latestVersion && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" /> คุณใช้เวอร์ชันล่าสุดอยู่แล้ว
          </div>
        )
      )}
    </Card>
  );
}
