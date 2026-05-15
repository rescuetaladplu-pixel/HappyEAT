## แก้หน้า "ร้านค้าของฉัน" ขึ้น "สำหรับเจ้าของร้านเท่านั้น"

### สาเหตุ
`src/routes/_app/my-restaurant.tsx` กั้นด้วย `role !== "restaurant" && role !== "admin"` เท่านั้น แต่ผู้ใช้ tester เป็น `customer` ที่มีร้านอยู่แล้ว (จากการ์ดบนโปรไฟล์ที่ตรวจ `hasRestaurant`) จึงถูกบล็อก

### สิ่งที่จะทำ
แก้ `src/routes/_app/my-restaurant.tsx`:

1. หลัง `load()` query ร้านด้วย `owner_id = user.id` อยู่แล้ว — ใช้ผลนั้นเป็นเกณฑ์เพิ่มเติม
2. เปลี่ยนเงื่อนไขบล็อก จาก
   ```
   if (role !== "restaurant" && role !== "admin")
   ```
   เป็น
   ```
   if (role !== "restaurant" && role !== "admin" && !restaurant)
   ```
   เพื่อให้ผู้ใช้ที่ "มีร้านอยู่แล้ว" เข้าจัดการร้านของตัวเองได้ (RLS policy `Owners update own restaurant` อนุญาตอยู่แล้วโดยอิง `owner_id`)
3. ส่วน "สร้างร้านอาหาร" (กรณี `!restaurant`) ยังคงสงวนไว้ให้เฉพาะ role `restaurant`/`admin` เพื่อให้ตรงกับ RLS `Owners insert restaurants` ที่ต้องมี role `restaurant` ตอน insert

ไม่แตะ DB / RLS / logic อื่น
