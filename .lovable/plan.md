## ปัญหาที่พบ

**1. กด "จัดการข้อมูลร้านค้า" แล้วไม่มีอะไรเกิดขึ้น**
- ไฟล์ `my-restaurant.tsx` และ `my-restaurant.settings.tsx` อยู่ติดกัน ใน TanStack Router flat routing แบบนี้ไฟล์ลูก (`.settings`) จะถูกซ้อน (nested) อยู่ใต้ไฟล์แม่ (`my-restaurant.tsx`) โดยอัตโนมัติ
- แต่ component `MyRestaurantHub` ไม่ได้ render `<Outlet />` — ดังนั้นกดแล้ว URL เปลี่ยนเป็น `/my-restaurant/settings` จริง แต่หน้า settings ไม่โผล่ เพราะถูก parent ทับ

**2. กดย้อนกลับจากหน้าจัดการเมนูแล้วไปที่ `/restaurant-dashboard`**
- ปุ่มย้อนกลับในไฟล์ `restaurant.menu.tsx`, `restaurant.orders.tsx`, `restaurant.analytics.tsx`, `restaurant.promotions.tsx`, `restaurant.reviews.tsx` ถูก hard-code ไปที่ `/restaurant-dashboard` ซึ่งเป็นหน้าเก่า ไม่ใช่ `/my-restaurant` ที่เป็น hub ปัจจุบัน

## แผนการแก้

**แก้ปัญหา 1:** เปลี่ยนชื่อไฟล์ `src/routes/_app/my-restaurant.settings.tsx` → `src/routes/_app/my-restaurant_.settings.tsx` (เติม `_` ท้าย segment แม่) เพื่อบอก TanStack Router ว่า "อย่าซ้อน route นี้ใต้ `my-restaurant`" — path URL ยังเป็น `/my-restaurant/settings` เหมือนเดิม แต่จะแทนที่หน้าทั้งหมดแทนที่จะรอ Outlet

**แก้ปัญหา 2:** ในไฟล์ทั้ง 5 (`restaurant.menu.tsx`, `restaurant.orders.tsx`, `restaurant.analytics.tsx`, `restaurant.promotions.tsx`, `restaurant.reviews.tsx`) เปลี่ยนทุก `<Link to="/restaurant-dashboard">` (ทั้งปุ่มย้อนกลับและปุ่ม "ไปตั้งค่าร้าน" ตอนยังไม่มีร้าน) → `<Link to="/my-restaurant">`

## ไฟล์ที่แก้
- เปลี่ยนชื่อ: `src/routes/_app/my-restaurant.settings.tsx` → `my-restaurant_.settings.tsx`
- แก้: `src/routes/_app/restaurant.menu.tsx`
- แก้: `src/routes/_app/restaurant.orders.tsx`
- แก้: `src/routes/_app/restaurant.analytics.tsx`
- แก้: `src/routes/_app/restaurant.promotions.tsx`
- แก้: `src/routes/_app/restaurant.reviews.tsx`

ไม่กระทบ logic, schema หรือ business rules — เป็นการแก้ routing/navigation ล้วนๆ