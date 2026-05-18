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
