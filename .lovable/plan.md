## ปรับโมเดล Role: ลูกค้าเป็นพื้นฐาน, เปิดร้านเพิ่มได้

### หลักการใหม่
- ทุกคนที่สมัคร = `customer` เสมอ (ไม่ต้องเลือก role ตอนสมัคร)
- ใครอยากขายของกดปุ่ม "เปิดร้าน" → เพิ่ม role `restaurant` ทับเข้าไป (มี role 2 ตัวพร้อมกัน)
- ผู้ที่เปิดร้านแล้ว ยังเป็นลูกค้าสั่งร้านอื่นได้ตามปกติ
- Rider ตัดออกจาก flow นี้ (ทำแยกทีหลัง)

### สิ่งที่จะแก้

1. **`src/routes/auth.tsx`** (หน้าสมัคร)
   - ลบ RadioGroup เลือก role ทั้งบล็อก
   - `signUp(...)` ส่ง role เป็น `"customer"` เสมอ
   - ลบ component `RoleOption` ที่ไม่ใช้แล้ว

2. **`src/lib/auth.tsx`**
   - เพิ่ม `roles: AppRole[]` ใน context (เก็บ role ทั้งหมดที่ user มี) ควบคู่กับ `role` เดิม (primary role ตาม priority — คงไว้ไม่ให้กระทบที่อื่น)
   - `fetchRole` set ทั้งสองค่า

3. **`src/routes/_app/profile.tsx`**
   - การ์ด "ร้านอาหารของฉัน" แสดงเมื่อ `roles` มี `restaurant`/`admin` หรือ `hasRestaurant`
   - การ์ด "สมัครเป็นเจ้าของร้าน" แสดงเมื่อ user ล็อกอินแล้ว และ **ไม่มี** role `restaurant` และ `!hasRestaurant` (ไม่ผูกกับ role customer อีก เพราะตอนนี้ทุกคนเป็น customer อยู่แล้ว)
   - หลังกด "สมัครเป็นเจ้าของร้าน" สำเร็จ ใช้ `window.location.href = "/my-restaurant"` (เดิม) เพื่อ refresh role

4. **`src/routes/_app/my-restaurant.tsx`**
   - เงื่อนไขเข้าหน้า: ผ่านเมื่อ `roles` มี `restaurant`/`admin` หรือมีร้านอยู่แล้ว (ที่แก้ไปแล้ว)
   - คงเหมือนเดิม

5. **`src/routes/_app/restaurant-dashboard.tsx`** (ตรวจ + ปรับถ้าจำเป็น)
   - ถ้ากั้นด้วย `role === "restaurant"` ให้เปลี่ยนเป็น `roles.includes("restaurant")` หรืออิงการมีร้าน เพื่อไม่ให้คนเปิดร้านแล้วเข้าไม่ได้

### ไม่แตะ
- DB / RLS / triggers — โครงสร้าง `user_roles` รองรับหลาย role ต่อ user อยู่แล้ว
- Logic ไรเดอร์ และหน้า rider-dashboard

### หมายเหตุ
- RLS `Owners insert restaurants` ยังต้องการ `has_role('restaurant')` — flow `becomeRestaurant` เพิ่ม role ก่อน insert restaurant อยู่แล้ว ใช้ได้
- `handle_new_user` trigger ใช้ `role` จาก `raw_user_meta_data` หรือ default `customer` — เมื่อ signup ส่ง `customer` ตลอด ก็ตรงกัน
