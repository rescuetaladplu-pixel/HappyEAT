
## สรุปประเด็น 3 เรื่อง

### 1) ทำไม "รายชื่อแอดมิน (0)" ทั้งที่มีบัญชีแอดมินอยู่จริง
- ตรวจฐานข้อมูลแล้วเจอแอดมิน `adminmai` (role=admin) อยู่จริงในตาราง `user_roles`
- บั๊กอยู่ที่ฟังก์ชัน `listAdmins` ใน `src/lib/admin.functions.ts` ที่ใช้ query แบบ join:
  ```
  .select("user_id, created_at, profiles!inner(...)")
  ```
  แต่ตาราง `profiles.id` ไม่ได้ประกาศ Foreign Key ไปที่ `user_roles.user_id` Supabase PostgREST จึง resolve relation ไม่ได้และคืนค่าว่าง
- **วิธีแก้**: เปลี่ยนมา query แยก 2 รอบเหมือน `listAllUsers` (ดึง `user_roles` ก่อน แล้วค่อยดึง `profiles` ตาม user_id) ไม่พึ่ง embed join

### 2) เรื่อง "ยังไม่ยืนยัน" ของผู้ใช้ สตีฟ จ๊อบ + ขอดูรหัสผ่าน
**การยืนยันอีเมล**:
- ระบบไม่ได้เปิด auto-confirm ผู้ใช้ต้องกดลิงก์ยืนยันในอีเมลที่ระบบส่งให้ตอนสมัคร
- สำหรับโดเมนปลอม (`@admin.local`, `@test.local`) จะไม่มีอีเมลส่งถึงจริง → ต้องให้แอดมินยืนยันแทน
- **เพิ่มปุ่ม "ยืนยันอีเมล"** ในตารางผู้ใช้ฝั่งแอดมิน เรียก server function ใหม่ `confirmUserEmail` ที่เรียก `supabase.auth.admin.updateUserById(id, { email_confirm: true })`

**เรื่องดูรหัสผ่าน**:
- **ทำไม่ได้ครับ** — Supabase เก็บรหัสผ่านเป็น bcrypt hash แอดมินก็เปิดดูไม่ได้ (เป็นมาตรฐานความปลอดภัย ห้ามเก็บ plain text เด็ดขาด)
- ทางเลือกที่ทำได้: **เพิ่มปุ่ม "ตั้งรหัสผ่านใหม่"** ในตารางผู้ใช้ ให้แอดมินกรอกรหัสใหม่ แล้วเรียก `updateUserById(id, { password })` หลังจากนั้นแอดมินค่อยแจ้งรหัสใหม่ให้ผู้ใช้เอง
- เพิ่ม server function `resetUserPassword` + dialog เล็ก ๆ ในหน้า admin

### 3) บทบาท "ร้านค้า" + ให้ขึ้นทั้ง ลูกค้า/ร้านค้า เมื่อสมัครเป็นเจ้าของร้าน
- `ROLE_LABEL` ในหน้า admin มี `restaurant: "เจ้าของร้าน"` อยู่แล้ว แต่ผู้ใช้อยากเห็นเป็น **"ร้านค้า"** จะเปลี่ยน label เป็น "ร้านค้า"
- ปัจจุบัน trigger `handle_new_user` insert role เดียวตามที่ส่งมาใน metadata (เช่น `restaurant`) ทำให้เจ้าของร้านไม่มี role `customer`
- **วิธีแก้** (migration): แก้ฟังก์ชัน `handle_new_user` — ถ้า role ที่ส่งมาเป็น `restaurant` หรือ `rider` ให้ insert ทั้ง role นั้น **และ** `customer` คู่กัน เพื่อให้สั่งอาหารได้ด้วย
- สำหรับผู้ใช้เก่าที่เป็น restaurant อยู่แล้ว: backfill โดย insert `customer` ให้ทุกคนที่มี role restaurant/rider แต่ยังไม่มี customer

---

## Technical changes

### A. `src/lib/admin.functions.ts`
- แก้ `listAdmins` ให้ดึง `user_roles` แล้ว join `profiles` ใน JS (เลิกใช้ `!inner`)
- เพิ่ม server fn:
  - `confirmUserEmail({ userId })` → `supabaseAdmin.auth.admin.updateUserById(userId, { email_confirm: true })`
  - `resetUserPassword({ userId, password })` (zod: password ≥ 6) → `updateUserById(userId, { password })`
- ทุกอันยังเช็ค `assertAdmin` เหมือนเดิม

### B. `src/routes/_app/admin.tsx`
- เปลี่ยน `ROLE_LABEL.restaurant` จาก "เจ้าของร้าน" → **"ร้านค้า"**
- ในแต่ละแถวของตาราง "ผู้ใช้ทั้งหมด" เพิ่มคอลัมน์ "การดำเนินการ" มี 2 ปุ่ม:
  - "ยืนยันอีเมล" (แสดงเฉพาะเมื่อ `email_confirmed === false`)
  - "ตั้งรหัสผ่านใหม่" (เปิด Dialog → กรอกรหัสใหม่ → ยืนยัน)
- หลังเรียกสำเร็จให้ `loadUsers()` ใหม่

### C. Migration (handle_new_user + backfill)
```sql
-- แก้ trigger function ให้เพิ่ม customer ควบคู่
CREATE OR REPLACE FUNCTION public.handle_new_user() ...
  -- insert _role
  -- ถ้า _role IN ('restaurant','rider') → insert ('customer') เพิ่มอีกตัว

-- backfill: สำหรับ restaurant/rider เดิมที่ยังไม่มี customer role
INSERT INTO user_roles (user_id, role)
SELECT DISTINCT ur.user_id, 'customer'::app_role
FROM user_roles ur
WHERE ur.role IN ('restaurant','rider')
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur2
    WHERE ur2.user_id = ur.user_id AND ur2.role = 'customer'
  );
```

---

## หมายเหตุที่ต้องเข้าใจตรงกัน
- **รหัสผ่านดูไม่ได้** ผมจะทำเป็นปุ่ม "ตั้งรหัสผ่านใหม่" แทน ถ้าโอเคจะลุยตามแพลนนี้เลยครับ
