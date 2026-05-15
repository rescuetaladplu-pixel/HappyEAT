## ภาพรวม

ฟีเจอร์ฝั่งร้านค้าที่จะเพิ่มมี 9 หัวข้อ ครอบคลุมตั้งแต่จัดการเมนู, ออเดอร์ real-time, สรุปยอดขาย, ไปจนถึงโปรโมชั่นและรีวิว ขนาดงานใหญ่มาก จึงเสนอแบ่งเป็น **4 เฟส** ทำทีละเฟสเพื่อให้ทดสอบได้ทัน และไม่กระทบของเดิมพังพร้อมกันหมด

หลังคุณอนุมัติแผนนี้ ผมจะเริ่ม **เฟส 1** ก่อน (เฟสอื่นๆ จะมาทำต่อทีหลัง ทีละเฟส)

---

## เฟส 1 — ระบบจัดการเมนู (เน้นที่สุด)

ครอบคลุม 4 หัวข้อแรก เพราะเป็นหัวใจของฝั่งร้าน:
- หมวดหมู่เมนู
- เพิ่ม/แก้ไขรายการอาหาร (รูป + รายละเอียด + ราคา)
- ตัวเลือกเสริม (Add-ons)
- เปิด/ปิดเมนูว่า "หมด"

### Database
- เพิ่มคอลัมน์ใน `menu_items`: `category_id uuid` (link ไป `menu_categories`), `sort_order int`
- ตารางใหม่ `menu_addon_groups` — กลุ่มตัวเลือก เช่น "ระดับความเผ็ด", "ขนาด"
  - `id, menu_item_id, name, is_required bool, min_select int, max_select int, sort_order int`
- ตารางใหม่ `menu_addon_options` — ตัวเลือกในแต่ละกลุ่ม เช่น "เผ็ดน้อย", "พิเศษ +20"
  - `id, group_id, name, price_delta numeric, sort_order int`
- RLS: เจ้าของร้านจัดการได้ทั้งหมด, public อ่านได้ผ่าน restaurant ที่ approve แล้ว

### หน้าใหม่/ปรับปรุง
- `restaurant-dashboard.tsx` ปรับให้เหลือเป็นหน้า hub มีลิงก์ไปหน้าย่อย
- หน้าใหม่ `restaurant/menu` — จัดการหมวดหมู่ + เมนู (drag-to-reorder, edit dialog, upload รูปเข้า bucket `restaurant-images/menu/`)
- Edit menu dialog: ชื่อ, รูป, รายละเอียด, ราคา, หมวดหมู่, สวิตช์ "พร้อมขาย/หมดวันนี้", จัดการ add-on groups + options

### ฝั่งลูกค้า
- หน้าร้าน `restaurants.$restaurantId.tsx` แสดงเมนูจัดกลุ่มตามหมวด
- ตอนเลือกเมนูใส่ตะกร้า แสดง modal เลือก add-ons → เก็บ `notes` ใน `order_items` (หรือ JSON ใน notes)

---

## เฟส 2 — แดชบอร์ดออเดอร์ Real-time + เปลี่ยนสถานะ

- หน้าใหม่ `restaurant/orders` — แสดงออเดอร์แบ่งคอลัมน์/แท็บตามสถานะ (รอรับ, กำลังปรุง, พร้อมส่ง, ส่งมอบไรเดอร์, สำเร็จ)
- subscribe realtime channel + เสียงแจ้งเตือนเมื่อมีออเดอร์ `pending` ใหม่ (Audio API)
- ปุ่มเปลี่ยนสถานะแบบครบวงจร: pending → accepted → preparing → ready → out_for_delivery → delivered
- เพิ่มสถานะใหม่ใน enum `order_status` ถ้ายังไม่ครบ (`out_for_delivery`, `delivered`, `cancelled`)
- รายละเอียดออเดอร์: รายการอาหาร + add-ons + เบอร์ลูกค้า + ที่อยู่ + ปุ่มโทร

---

## เฟส 3 — สรุปยอดขาย + โปรโมชั่น

### สรุปยอดขาย
- หน้าใหม่ `restaurant/analytics`
- การ์ดสรุป: ยอดขายวันนี้, สัปดาห์, เดือน, จำนวนออเดอร์, ค่าเฉลี่ยต่อออเดอร์, เมนูขายดี Top 5
- กราฟยอดขาย 7/30 วัน (ใช้ recharts ที่มีอยู่แล้ว)
- ตัวกรองช่วงวันที่

### โปรโมชั่น
- ตารางใหม่ `promotions`: `id, restaurant_id, code, type ('percent'|'amount'|'free_delivery'), value, min_order, starts_at, ends_at, max_uses, used_count, is_active`
- ตาราง `menu_item_discounts`: discount รายเมนู (`menu_item_id, discount_price, starts_at, ends_at`)
- หน้าใหม่ `restaurant/promotions` — สร้าง/แก้ไข/ปิดโปรโมชั่น
- ฝั่งตะกร้าลูกค้า: ช่องใส่โค้ดส่วนลด คำนวณส่วนลดก่อน checkout

---

## เฟส 4 — รีวิวและคะแนน

- ฝั่งลูกค้า: หลังออเดอร์ status = `delivered` แสดงปุ่ม "ให้คะแนน" → form ให้ดาวร้าน + ดาวไรเดอร์ + คอมเมนต์ (ตาราง `reviews` มีอยู่แล้ว)
- เพิ่มคอลัมน์ `owner_reply text, replied_at timestamptz` ใน `reviews`
- เพิ่ม RLS policy ให้เจ้าของร้านอัปเดตเฉพาะ `owner_reply` ของรีวิวร้านตัวเอง
- หน้าใหม่ `restaurant/reviews` — list รีวิวล่าสุด พร้อมช่องตอบกลับ
- คำนวณ `restaurants.rating` ผ่าน trigger: avg(restaurant_rating) จาก reviews

---

## รายละเอียดทางเทคนิค

- ใช้ TanStack Start file-based routes ตามแพทเทิร์นเดิม (`src/routes/_app/restaurant.{menu,orders,analytics,promotions,reviews}.tsx`)
- Realtime ใช้ supabase channel ตามที่ทำในเฟสก่อน (publication `supabase_realtime` ต้อง add table ที่เกี่ยวข้อง — orders/menu_items)
- รูปเมนูเก็บใน bucket `restaurant-images` ที่มีอยู่แล้ว path `menu/{restaurant_id}/{uuid}.{ext}`
- ทุกตารางใหม่จะมี RLS: เจ้าของร้านจัดการเฉพาะของร้านตนเอง, public อ่านได้เฉพาะของร้านที่ approve แล้ว

## ส่วนที่ไม่แตะในเฟสนี้
- ไม่แตะระบบไรเดอร์, ระบบ admin, payment gateway
- ไม่ทำ multi-restaurant per owner (หนึ่ง user หนึ่งร้านเหมือนเดิม)
- ไม่ทำระบบ loyalty/แต้มสะสม

---

## ขอคอนเฟิร์มก่อนเริ่ม

1. โอเคกับการแบ่ง 4 เฟสนี้ไหม? หรืออยากรวบ/แตกต่างออกไป
2. ถ้าโอเค — ผมเริ่ม **เฟส 1 (จัดการเมนู + add-ons + หมวดหมู่ + หมดวันนี้)** เลย
