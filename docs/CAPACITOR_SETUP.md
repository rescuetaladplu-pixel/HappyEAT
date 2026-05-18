# Capacitor Setup — HappyEat Customer/Restaurant APK

คู่มือสร้างไฟล์ APK เพื่อติดตั้งทดสอบบนมือถือตัวเอง (ยังไม่ขึ้น Play Store)

โหมดที่ใช้: **Live URL Mode** — APK เปิดเว็บจาก `https://happyeat.lovable.app` ตรงๆ
ข้อดี: แก้โค้ดใน Lovable → APK เห็นทันที ไม่ต้อง rebuild

---

## สิ่งที่ต้องเตรียมบนเครื่องคุณ (ครั้งเดียว)

1. **Node.js 20+** — https://nodejs.org
2. **JDK 21** — https://adoptium.net (เลือก Temurin 21 LTS) หรือใช้ **JetBrains Runtime 21 (jbr-21)** ที่มากับ Android Studio
   > ⚠️ ต้องเป็น **Java 21** เท่านั้น — Capacitor + Android Gradle Plugin รุ่นล่าสุดต้องการ JDK 21 ไม่งั้นจะเจอ error `invalid source release: 21`
3. **Android Studio** — https://developer.android.com/studio
   - ตอนติดตั้งให้ติ๊ก: Android SDK, Android SDK Platform, Android Virtual Device
4. **Git** — https://git-scm.com

---

## ขั้นตอนทำครั้งแรก

### 1. Export โปรเจกต์จาก Lovable ไป GitHub
   - กดปุ่ม GitHub ขวาบนใน Lovable → Connect → Create Repository
   - เปิด terminal บนเครื่อง:
   ```bash
   git clone https://github.com/<your-username>/<repo-name>.git
   cd <repo-name>
   npm install
   ```

### 2. เพิ่ม Android platform
   ```bash
   npx cap add android
   ```
   จะได้โฟลเดอร์ `android/` ขึ้นมา

### 3. Sync config เข้า Android project
   ```bash
   npx cap sync android
   ```

### 4. เปิดใน Android Studio
   ```bash
   npx cap open android
   ```
   รอ Gradle sync เสร็จ (ครั้งแรกนานหน่อย 5-15 นาที)

### 5. Build APK
   - Android Studio menu → **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
   - รอจน build เสร็จ จะมี popup มุมขวาล่าง → กด **locate**
   - ไฟล์อยู่ที่ `android/app/build/outputs/apk/debug/app-debug.apk`

### 6. ติดตั้งบนมือถือ
   - โอนไฟล์ APK เข้ามือถือ (USB / Google Drive / LINE Keep ส่งให้ตัวเอง)
   - บนมือถือ: Settings → Security → เปิด **Install from Unknown Sources** ให้แอป Files
   - แตะไฟล์ APK → Install → เปิด HappyEat ได้เลย

---

## เวลาแก้โค้ดในอนาคต

เพราะใช้ Live URL Mode → **ไม่ต้อง rebuild APK เลย**
- แก้โค้ดใน Lovable → กด Publish → เปิดแอปบนมือถือ → เห็นการเปลี่ยนแปลงทันที

ต้อง rebuild APK ใหม่ก็ต่อเมื่อ:
- เปลี่ยน app icon / app name / splash screen
- เพิ่ม Capacitor plugin ใหม่
- เปลี่ยน `capacitor.config.ts`

ขั้นตอน rebuild:
```bash
git pull
npm install
npx cap sync android
# เปิด Android Studio → Build APK → ติดตั้งทับตัวเดิม
```

---

## ตอนพร้อมขึ้น Play Store (ทำภายหลัง)

1. สมัคร Google Play Console ($25 ครั้งเดียว)
2. สร้าง **keystore** สำหรับ sign release (เก็บไฟล์ + รหัสไว้ดีๆ ห้ามหาย!)
   ```bash
   keytool -genkey -v -keystore happyeat.keystore -alias happyeat -keyalg RSA -keysize 2048 -validity 10000
   ```
3. Build AAB แทน APK: Android Studio → **Build** → **Generate Signed Bundle/APK** → **Android App Bundle**
4. อัปโหลดไฟล์ `.aab` เข้า Play Console
5. กรอก Privacy Policy URL, screenshots, คำอธิบาย, ส่ง review

---

## Troubleshooting

- **Gradle sync ค้าง** → File → Invalidate Caches → Restart
- **"SDK location not found"** → File → Project Structure → SDK Location → ชี้ไปที่ Android SDK path
- **APK install ไม่ได้** → ลบแอปเก่าก่อน (ถ้า signature ไม่ตรง install ทับไม่ได้)
- **แอปเปิดแล้วขาว** → เช็คเน็ตมือถือ (live mode ต้องมีเน็ตเสมอ)
