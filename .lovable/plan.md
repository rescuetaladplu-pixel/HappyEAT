# เปลี่ยนเสียงแจ้งเตือนเป็น Native Android

## ทำไมต้องเปลี่ยน

Web Audio ใน WebView มีข้อจำกัด: เล่นได้แค่ตอนแอปเปิดอยู่ + ต้องแตะหน้าจอก่อน + โดน silent mode กดเสียง  
Native FCM + notification channel: ดังแม้แอปปิด/ล็อกหน้าจอ, ใช้ channel แยกจาก silent mode ได้, ระบบ Android จัดการให้

## สิ่งที่ผมจะทำ (ฝั่งโค้ด)

### 1. สร้างไฟล์เสียง MP3 จริง 3 ไฟล์
ใช้ Python + numpy สังเคราะห์เสียงจาก algorithm เดียวกับ Web Audio version เลย → siren / airhorn / emergency  
วางไว้ที่ `/mnt/documents/sounds/` ให้คุณดาวน์โหลด

### 2. เพิ่ม `src/lib/native-notifications.ts`
- ตรวจว่าอยู่ใน Capacitor native หรือ web
- ถ้า native: เรียก `PushNotifications.createChannel()` ตอน app boot สร้าง 3 channels:
  - `orders_siren` → sound: `siren`
  - `orders_airhorn` → sound: `airhorn`
  - `orders_emergency` → sound: `emergency`
- importance: HIGH, vibration: on, bypass DND สำหรับร้าน

### 3. อัปเดต `src/routes/_app/restaurant.notification-settings.tsx`
- ปุ่ม "ฟัง" บน native → ส่ง test local notification (เพื่อเทสเสียงจริง) แทน Web Audio
- ปุ่มเลือกเสียง → save preference + เรียก channel ใหม่
- บน web → ใช้ Web Audio เหมือนเดิม (สำหรับ admin preview)

### 4. แก้ `src/lib/fcm.functions.ts` (server)
เพิ่ม `android.notification.channel_id` ลง FCM payload ตาม preference ของ user รับสาย:
```ts
android: {
  notification: {
    channel_id: userSoundPref, // 'orders_siren' | 'orders_airhorn' | 'orders_emergency'
    sound: userSoundPref,
    priority: 'high',
  },
  priority: 'high',
}
```

### 5. เก็บ sound preference ใน DB
เพิ่มคอลัมน์ `notification_sound` ใน `profiles` (ค่า: 'siren' | 'airhorn' | 'emergency', default 'siren')  
เพื่อให้ server รู้ว่าจะส่ง channel ไหนให้ user คนนั้น

### 6. คง Web Audio ไว้
`notification-sounds.ts` ยังอยู่ — ใช้สำหรับ:
- Browser/PWA users (ไม่ได้ลง APK)
- Foreground in-app feedback (เสริมกับ native)

## สิ่งที่คุณต้องทำเอง

### A. วางไฟล์เสียงใน Android project
1. ดาวน์โหลด 3 ไฟล์จาก `/mnt/documents/sounds/` ที่ผมจะสร้างให้
2. เปิดโปรเจกต์ Android ใน Android Studio
3. วางที่ `android/app/src/main/res/raw/`:
   - `siren.mp3`
   - `airhorn.mp3`
   - `emergency.mp3`
   
   (ชื่อต้องตรงเป๊ะ ตัวพิมพ์เล็ก, ไม่มี dash/space)

### B. Rebuild APK
- รัน `npx cap sync android` แล้ว build APK ใหม่
- ต้องทำทั้ง **HappyEat** และ **HappyRider** (ฝั่ง rider จะแจ้งให้ทำเหมือนกัน)

### C. แจ้งห้อง HappyRider
ผมจะอัปเดต `docs/SHARED_CONTRACT.md` เพิ่มสเปก channel IDs + sound names เพื่อให้ฝั่ง rider ใช้ชื่อเดียวกัน → ส่ง FCM cross-app ได้ถูก channel

## ลำดับการทำ

1. ผมสร้างไฟล์ MP3 + เขียนโค้ดทั้งหมด + อัปเดต SHARED_CONTRACT (1 turn)
2. คุณดาวน์โหลดไฟล์ MP3 + วางใน Android Studio + rebuild APK
3. ทดสอบ: ส่งออเดอร์ทดลอง → ปิดแอปแล้วดูว่าเสียงดังจาก notification channel จริงไหม
4. ไปทำฝั่ง HappyRider ด้วย step เดียวกัน

## หมายเหตุสำคัญ

- **ต้อง rebuild APK** หลังวางไฟล์เสียงใหม่ (ไฟล์ใน `res/raw` ผูกกับ APK ไม่ใช่ web bundle)
- **ทุกครั้งที่เพิ่ม/เปลี่ยนเสียงใหม่ในอนาคต** ก็ต้อง rebuild APK อีก
- Notification channel **เปลี่ยนเสียงไม่ได้หลังสร้างแล้ว** — ถ้าจะเปลี่ยนต้องสร้าง channel ID ใหม่ (เช่น `orders_siren_v2`)
- iOS ใช้กลไกต่างกัน (ไฟล์ใน app bundle + APNs payload) — ตอนนี้โฟกัส Android ตามที่คุณบอก ผมจะข้ามไปก่อน
