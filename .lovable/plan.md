
# แผน: ระบบบัญชีแอดมินแบบใช้ username

## สรุปโจทย์
- สร้างแอดมินคนแรก: **username = `adminmai`**, **password = `adminmai001`**
- ระบบเดิมใช้ Supabase Auth ซึ่ง**บังคับต้องเป็นอีเมล** → ใช้วิธี map username เป็น "อีเมลภายใน" เช่น `adminmai@admin.local`
- หน้าแอดมินต้องมีปุ่ม **"สร้างแอดมินใหม่"** ที่กรอกแค่ username + password ได้เลย

---

## สิ่งที่จะทำ

### 1. ฐานข้อมูล (1 migration)
- เพิ่มคอลัมน์ `username` (text, unique, nullable) ใน table `profiles`
- สร้างบัญชีแอดมินแรก:
  - email ภายในระบบ: `adminmai@admin.local`
  - password: `adminmai001`
  - profile.username = `adminmai`, full_name = `Admin`
  - user_roles.role = `admin`

### 2. หน้า Login (`src/routes/auth.tsx`)
- เพิ่ม toggle: **"เข้าสู่ระบบด้วย Username (สำหรับแอดมิน)"**
- ถ้าเลือก username mode: แปลง `adminmai` → `adminmai@admin.local` ก่อนส่งให้ Supabase
- ถ้า mode email ปกติ: ทำงานเหมือนเดิม
- เอา option **"แอดมิน"** ออกจากหน้าสมัครสมาชิก (กันคนสุ่มสมัครเป็นแอดมิน)

### 3. หน้าแอดมิน (`src/routes/_app/admin.tsx`)
- เพิ่มส่วน **"จัดการแอดมิน"**: ฟอร์มกรอก username + password → กดสร้าง
- รายชื่อแอดมินทั้งหมด (username + วันที่สร้าง)

### 4. Server Function สำหรับสร้างแอดมิน (`src/lib/admin.functions.ts`)
- ใช้ `requireSupabaseAuth` + เช็ค `has_role(userId, 'admin')` ก่อน
- ใช้ `supabaseAdmin` เรียก `auth.admin.createUser()` ด้วย email สังเคราะห์ + email_confirm: true
- เพิ่ม username ลง profiles + role 'admin' ลง user_roles
- Validate: username 3–32 ตัว, [a-z0-9_], password ≥ 6 ตัว

---

## รายละเอียดด้านเทคนิค

**ทำไมต้องใช้ "อีเมลสังเคราะห์":** Supabase Auth บังคับ email format เปลี่ยนไม่ได้ — วิธีมาตรฐานคือ map username → `<username>@<internal-domain>` แล้วเก็บ username จริงไว้ใน profiles เพื่อใช้แสดงผล/ค้นหา

**ความปลอดภัย:** การสร้างแอดมินทำผ่าน server function ที่ verify role ก่อนเสมอ (ไม่ trust client) + RLS บน user_roles อนุญาตเฉพาะแอดมินจัดการ role อยู่แล้ว

**โดเมน internal:** `admin.local` (ไม่ส่งอีเมลจริง เพราะปิด email confirm สำหรับบัญชีแอดมิน)

---

## ผลลัพธ์
- ล็อกอินด้วย `adminmai` / `adminmai001` ได้ทันที
- หลังเข้าระบบ → ไปหน้า /admin → สร้างแอดมินคนต่อไปเองได้ผ่าน UI
- ลูกค้า/ร้าน/ไรเดอร์ยังคงสมัครและล็อกอินด้วยอีเมลเหมือนเดิม
