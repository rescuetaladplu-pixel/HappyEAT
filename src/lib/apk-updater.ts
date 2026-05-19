import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { FileOpener } from "@capacitor-community/file-opener";
import { Browser } from "@capacitor/browser";

export type ApkProgress = {
  percent: number; // 0-100
  bytes: number;
  total: number;
};

/**
 * ดาวน์โหลด APK ภายในแอป + เปิด installer ของ Android ให้กดติดตั้งทับ
 * - ใช้ได้เฉพาะ Android native (มี plugin @capacitor/filesystem)
 * - ถ้าไม่ใช่ native หรือ platform อื่น → fallback เปิด browser
 *
 * ต้องการ AndroidManifest permission:
 *   <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
 */
export async function downloadAndInstallApk(
  url: string,
  onProgress?: (p: ApkProgress) => void,
): Promise<void> {
  const isNative = Capacitor.isNativePlatform();
  const platform = isNative ? Capacitor.getPlatform() : "web";

  // Web หรือ iOS → fallback browser
  if (!isNative || platform !== "android") {
    try {
      await Browser.open({ url });
    } catch {
      window.open(url, "_blank");
    }
    return;
  }

  const fileName = `happyeat-update-${Date.now()}.apk`;

  // ฟัง progress (Filesystem ยิง event "progress" เมื่อ progress: true)
  let listenerHandle: { remove: () => Promise<void> } | undefined;
  if (onProgress) {
    listenerHandle = await Filesystem.addListener("progress", (event) => {
      const total = event.contentLength || 0;
      const bytes = event.bytes || 0;
      const percent = total > 0 ? Math.round((bytes / total) * 100) : 0;
      onProgress({ percent, bytes, total });
    });
  }

  try {
    const result = await Filesystem.downloadFile({
      url,
      path: fileName,
      directory: Directory.Cache,
      progress: true,
    });

    const apkPath = result.path;
    if (!apkPath) throw new Error("ไม่สามารถบันทึกไฟล์ APK ได้");

    // เปิด APK → Android จะ prompt ติดตั้งทับ
    await FileOpener.open({
      filePath: apkPath,
      contentType: "application/vnd.android.package-archive",
      openWithDefault: true,
    });
  } finally {
    if (listenerHandle) {
      try {
        await listenerHandle.remove();
      } catch {
        /* ignore */
      }
    }
  }
}
