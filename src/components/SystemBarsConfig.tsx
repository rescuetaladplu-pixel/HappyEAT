import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

/**
 * บังคับให้ Android ไม่วาด webview ทับ status bar
 * - ทำเฉพาะ native (Android/iOS) — บนเว็บไม่มีผล
 * - ส่วน navigation bar ด้านล่างคุมจาก capacitor.config.ts (adjustMarginsForEdgeToEdge)
 *   ซึ่งต้อง rebuild APK ถึงจะมีผลเต็ม
 */
export function SystemBarsConfig() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    (async () => {
      try {
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setBackgroundColor({ color: "#ffffff" });
      } catch {
        /* plugin ไม่พร้อม — ปล่อย */
      }
    })();
  }, []);
  return null;
}
