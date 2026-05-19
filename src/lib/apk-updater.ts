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

  // ตรวจว่า Filesystem plugin ถูก register ใน native APK รึยัง
  // (APK เวอร์ชันเก่าที่ build ก่อนเพิ่ม plugin จะไม่มี → ต้อง fallback browser)
  const hasFilesystem = Capacitor.isPluginAvailable("Filesystem");
  const hasFileOpener = Capacitor.isPluginAvailable("FileOpener");

  if (!hasFilesystem || !hasFileOpener) {
    try {
      await Browser.open({ url });
    } catch {
      window.open(url, "_blank");
    }
    return;
  }

  // ฟัง progress (Filesystem ยิง event "progress" เมื่อ progress: true)
  let listenerHandle: { remove: () => Promise<void> } | undefined;
  if (onProgress) {
    try {
      listenerHandle = await Filesystem.addListener("progress", (event) => {
        const total = event.contentLength || 0;
        const bytes = event.bytes || 0;
        const percent = total > 0 ? Math.round((bytes / total) * 100) : 0;
        onProgress({ percent, bytes, total });
      });
    } catch {
      /* ignore */
    }
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

    await FileOpener.open({
      filePath: apkPath,
      contentType: "application/vnd.android.package-archive",
      openWithDefault: true,
    });
  } catch (err) {
    // Plugin error / runtime ไม่รองรับ → fallback browser
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("not implemented") ||
      msg.includes("not available") ||
      msg.includes("UNIMPLEMENTED")
    ) {
      try {
        await Browser.open({ url });
      } catch {
        window.open(url, "_blank");
      }
      return;
    }
    throw err;
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
