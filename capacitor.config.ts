import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.happyeat.customer',
  appName: 'HappyEat',
  webDir: 'dist',
  // Live URL mode: APK โหลดเว็บจาก published URL โดยตรง
  // → แก้โค้ดในโปรเจกต์แล้วเด้งใส่ APK เลย ไม่ต้อง rebuild
  server: {
    url: 'https://happyeat.lovable.app',
    cleartext: false,
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    // Android 15+ บังคับ edge-to-edge — "force" ให้ระบบเพิ่ม margin ให้ webview
    // เอง เพื่อไม่ให้คอนเทนต์วาดทับ status bar / navigation bar
    adjustMarginsForEdgeToEdge: "force",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#f97316',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
