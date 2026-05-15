# แก้ปัญหา: กดเมนูในร้านค้าของฉันแล้วเข้าไม่ได้

## สาเหตุ

ในหน้า `restaurant.menu.tsx` (และหน้าอื่นๆ ที่คล้ายกัน) มีการเช็ก `role !== "restaurant" && role !== "admin"` ก่อนแสดงเนื้อหา แต่:

1. `role` ใน `useAuth` ถูกดึงมาแบบ **async** (มี `setTimeout` แยกใน `auth.tsx` หลัง session โหลด)
2. หน้าเหล่านี้เช็กแค่ `loading` ภายใน (จากการ query restaurants) ไม่ได้รอ `auth.loading` หรือรอ `role` โหลดเสร็จ
3. ผลคือ: ตอน mount ครั้งแรก `role` ยังเป็น `null` → ตกเข้าเงื่อนไข "ไม่ใช่เจ้าของร้าน" → ขึ้นข้อความบล็อกทันที ทั้งที่ user เป็นเจ้าของร้านจริง

อีกจุดที่เกี่ยวข้อง: หน้า `analytics`, `orders`, `promotions`, `reviews` ใช้แค่ `restaurantId` (จาก `owner_id = user.id`) ไม่ได้เช็ก role อยู่แล้ว แต่ก็มีปัญหา race เหมือนกัน — ถ้า user ยังไม่โหลดเสร็จ จะ query ไม่ได้ และโชว์หน้าว่าง/loading ค้าง

## แผนการแก้

### 1. `src/routes/_app/restaurant.menu.tsx`
- เปลี่ยน guard ให้รอทั้ง `auth.loading` และให้รอจนกว่า `role` จะมีค่า ก่อนค่อยตัดสินว่า "ไม่ใช่เจ้าของร้าน"
- เปลี่ยนเงื่อนไขเป็น: ถ้า user เป็นเจ้าของร้าน (มี restaurant แถวที่ `owner_id = user.id`) ให้ผ่านได้ทันที โดยไม่ต้องเช็ก role ก็ได้ — เพราะ RLS ป้องกันไว้อยู่แล้ว และเจ้าของร้านที่ role ยังไม่ sync จะไม่ถูกบล็อก

### 2. หน้าจัดการอื่นๆ ที่ลิงก์มาจาก hub
ตรวจและทำ pattern เดียวกัน:
- `restaurant.analytics.tsx`
- `restaurant.orders.tsx`
- `restaurant.promotions.tsx`
- `restaurant.reviews.tsx`
- `my-restaurant.settings.tsx`

ใช้ logic เดียวกัน:
```
if (auth.loading || pageLoading) → spinner
else if (!restaurant) → "ยังไม่พบร้านของคุณ" + ปุ่มกลับ
else → แสดงเนื้อหา
```

ไม่ใช้การเช็ก `role` เป็น guard หลักอีกต่อไป (ใช้การมี restaurant ของตัวเองเป็นเกณฑ์แทน ซึ่งตรงกับสิ่งที่ผู้ใช้ต้องการจริง)

### 3. หมายเหตุเรื่อง 401 `permission denied for function has_role`
จาก network log พบ error นี้ตอนเรียก `restaurants` ในหน้า home ซึ่งเป็นคนละปัญหา (เกี่ยวกับ grant permission ของ DB function `has_role` ให้ role `anon`/`authenticated`) — ถ้าต้องการให้แก้ด้วย จะเสนอเป็น migration แยก

## รายละเอียดทางเทคนิค

ใน auth context (`src/lib/auth.tsx`) `loading` จะเป็น `false` หลัง `getSession()` เสร็จ แต่ `fetchRole()` ถูก dispatch ด้วย `setTimeout(..., 0)` ทำให้ `role` ยังเป็น `null` ชั่วครู่หลัง `loading=false` — guard ในหน้าย่อยเลยตัดสินผิดพลาดในเสี้ยววินาทีนั้น และเพราะไม่มี re-evaluate จึงค้างอยู่ที่ "หน้านี้สำหรับเจ้าของร้านเท่านั้น" จนกว่าจะ refresh

วิธีแก้ที่ปลอดภัยที่สุดคือเลิกใช้ role เป็น gate ในหน้าจัดการที่ผูกกับ `restaurants.owner_id` อยู่แล้ว แล้วใช้ "มี restaurant ที่ฉันเป็นเจ้าของหรือไม่" เป็น gate แทน
