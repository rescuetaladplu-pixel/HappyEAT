// Native push notification channel setup for Android (Capacitor).
// On native: register 3 Android notification channels (siren/airhorn/emergency)
// pointing to MP3 resources in `android/app/src/main/res/raw/`.
// Each channel is HIGH importance + vibration so it cuts through silent mode
// when the user explicitly enables it in Android system settings.
//
// On web (PWA / dev): no-op. Web Audio fallback in `notification-sounds.ts`
// is still used for in-app preview and foreground feedback.
//
// ⚠️ IMPORTANT — APK rebuild required after:
//   - adding new sound files to res/raw/
//   - changing channel IDs (Android caches channel config — must use NEW id)

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { supabase } from "@/integrations/supabase/client";
import type { SoundId } from "./notification-sounds";

export const ORDER_CHANNELS: { id: string; sound: SoundId; name: string }[] = [
  { id: "orders_siren", sound: "siren", name: "ออเดอร์ — Siren ตำรวจ" },
  { id: "orders_airhorn", sound: "airhorn", name: "ออเดอร์ — Air Horn" },
  { id: "orders_emergency", sound: "emergency", name: "ออเดอร์ — Emergency" },
];

export function channelIdForSound(sound: SoundId): string {
  return `orders_${sound}`;
}

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

let channelsCreated = false;

/** Create all order notification channels on Android. Safe to call multiple times. */
export async function ensureOrderChannels(): Promise<void> {
  if (channelsCreated) return;
  if (!isNativeApp()) return;
  if (Capacitor.getPlatform() !== "android") return;

  try {
    for (const ch of ORDER_CHANNELS) {
      await PushNotifications.createChannel({
        id: ch.id,
        name: ch.name,
        description: "แจ้งเตือนออเดอร์ใหม่และการอัปเดตสถานะ",
        importance: 5, // IMPORTANCE_HIGH — heads-up + sound
        visibility: 1, // VISIBILITY_PUBLIC
        sound: ch.sound, // resolves to res/raw/<sound>.mp3
        vibration: true,
        lights: true,
        lightColor: "#FF6B2C",
      });
    }
    channelsCreated = true;
  } catch (err) {
    console.error("[native-notifications] createChannel failed", err);
  }
}

/** Read the current user's notification sound preference from DB. */
export async function getUserSoundPref(): Promise<SoundId> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return "siren";
  const { data } = await supabase
    .from("profiles")
    .select("notification_sound")
    .eq("id", uid)
    .maybeSingle();
  const v = (data?.notification_sound ?? "siren") as SoundId;
  return v;
}

/** Persist the user's sound preference. Server reads this when sending FCM. */
export async function setUserSoundPref(sound: SoundId): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return;
  await supabase
    .from("profiles")
    .update({ notification_sound: sound })
    .eq("id", uid);
}
