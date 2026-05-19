import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { supabase } from '@/integrations/supabase/client';
import { APP_VERSION, compareVersions } from '@/lib/app-version';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, AlertTriangle } from 'lucide-react';

type AppConfig = {
  latest_version: string;
  min_supported_version: string;
  apk_download_url: string | null;
  release_notes: string | null;
  force_update: boolean;
};

export function ForceUpdateGate() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>(APP_VERSION);
  const [mustUpdate, setMustUpdate] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      // ทำเฉพาะ native app — บนเว็บไม่ต้องเช็ค (ผู้ใช้ได้ของใหม่อัตโนมัติ)
      if (!Capacitor.isNativePlatform()) return;

      const platform = Capacitor.getPlatform(); // 'android' | 'ios'
      if (platform !== 'android' && platform !== 'ios') return;

      // อ่านเวอร์ชันจริงจาก native app
      let version = APP_VERSION;
      try {
        const info = await CapApp.getInfo();
        version = info.version || APP_VERSION;
      } catch {
        // bridge ไม่พร้อม — ใช้ค่า fallback
      }
      if (cancelled) return;
      setCurrentVersion(version);

      // อ่านข้อมูลเวอร์ชันล่าสุดจาก DB
      const { data, error } = await supabase
        .from('app_config')
        .select('latest_version, min_supported_version, apk_download_url, release_notes, force_update')
        .eq('platform', platform)
        .maybeSingle();

      if (cancelled || error || !data) return;
      setConfig(data);

      const belowMin = compareVersions(version, data.min_supported_version) < 0;
      if (data.force_update || belowMin) {
        setMustUpdate(true);
      }
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdate = async () => {
    if (!config?.apk_download_url) return;
    try {
      await Browser.open({ url: config.apk_download_url });
    } catch {
      // fallback
      window.open(config.apk_download_url, '_blank');
    }
  };

  if (!mustUpdate || !config) return null;

  return (
    <Dialog open modal>
      <DialogContent
        className="max-w-sm"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        showCloseButton={false}
      >
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
            <span className="font-mono font-semibold">{currentVersion}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-primary/10 p-3">
            <span className="text-muted-foreground">เวอร์ชันล่าสุด</span>
            <span className="font-mono font-semibold text-primary">{config.latest_version}</span>
          </div>

          {config.release_notes && (
            <div className="rounded-lg border border-border p-3">
              <p className="mb-1 text-xs font-semibold text-muted-foreground">มีอะไรใหม่</p>
              <p className="whitespace-pre-line text-sm">{config.release_notes}</p>
            </div>
          )}
        </div>

        <Button
          onClick={handleUpdate}
          disabled={!config.apk_download_url}
          size="lg"
          className="mt-2 w-full gap-2"
        >
          <Download className="h-5 w-5" />
          ดาวน์โหลดเวอร์ชันใหม่
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          หลังดาวน์โหลดเสร็จ กดไฟล์ APK เพื่อติดตั้งทับเวอร์ชันเดิมได้เลย
        </p>
      </DialogContent>
    </Dialog>
  );
}
