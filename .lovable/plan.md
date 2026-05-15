# แผนเฟส 2-4: ระบบหลังบ้านร้านอาหารส่วนที่เหลือ

ทำต่อจาก Phase 1 (จัดการเมนู) ครอบคลุม 6 ฟีเจอร์ที่เหลือ แบ่งเป็น 3 เฟส

---

## Phase 2 — Real-time Orders + Status Flow

**Database**
- ตรวจสอบ enum `order_status` ให้มี: `pending`, `accepted`, `preparing`, `ready`, `picked_up`, `delivered`, `cancelled` (เพิ่มที่ขาด)
- เปิด realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE orders, order_items;`
- ตั้ง `REPLICA IDENTITY FULL` กับ orders

**หน้าใหม่: `src/routes/_app/restaurant.orders.tsx`**
- Tabs ตามสถานะ: ใหม่ / กำลังทำ / พร้อมส่ง / กำลังจัดส่ง / เสร็จแล้ว / ยกเลิก
- การ์ดออเดอร์: เลขออเดอร์, ลูกค้า, รายการ+add-ons+โน้ต, ยอดรวม, เวลา, ที่อยู่
- ปุ่มเปลี่ยนสถานะตาม flow (รับออเดอร์ → กำลังปรุง → พร้อมส่ง → ฯลฯ) + ปุ่มปฏิเสธพร้อมเหตุผล
- Subscribe `postgres_changes` event=INSERT/UPDATE filter restaurant_id → refetch + toast
- เสียงแจ้งเตือนเมื่อมีออเดอร์ใหม่ (HTML5 Audio + asset เสียง ding) + ปุ่มเปิด/ปิดเสียง (เก็บใน localStorage)
- Badge นับออเดอร์ใหม่ในเมนู dashboard

**ปรับ `restaurant-dashboard.tsx`**
- Card "ออเดอร์ใหม่" ลิงก์ไป `/restaurant/orders` พร้อม badge realtime

---

## Phase 3 — Analytics + Promotions

**3A. Analytics — `src/routes/_app/restaurant.analytics.tsx`**
- Filter: วันนี้ / 7 วัน / 30 วัน / กำหนดเอง
- Summary cards: ยอดขายรวม, จำนวนออเดอร์, AOV, อัตรายกเลิก
- Charts (recharts): ยอดขายรายวัน (line), เมนูขายดี top 10 (bar), สัดส่วนสถานะ (pie)
- Query รวมจาก orders + order_items (status = delivered)

**3B. Promotions — Database**
```
promotions (id, restaurant_id, code, type[percent|fixed], value, min_order, max_discount,
            starts_at, ends_at, usage_limit, used_count, is_active)
order_promotions (order_id, promotion_id, discount_amount)  -- audit
menu_items: เพิ่ม discount_price (numeric, nullable)
```
RLS: owner manage own promotions; public select เฉพาะ active+approved

**3B. Promotions — UI**
- `restaurant.promotions.tsx`: CRUD โค้ดส่วนลด, toggle active, ดูสถิติการใช้
- `menu_items` edit dialog: เพิ่มช่อง "ราคาโปร" + แสดง strikethrough หน้าลูกค้า
- `cart.tsx`: ช่องกรอกโค้ด + validate (server fn) + แสดงส่วนลด + บันทึก order_promotions ตอน checkout

---

## Phase 4 — Reviews Management

**Database**
- `reviews`: เพิ่ม `owner_reply text`, `replied_at timestamptz`
- RLS เพิ่ม policy: owner update reply เฉพาะรีวิวร้านตัวเอง
- Trigger: เมื่อ insert/update review → คำนวณ avg `restaurant_rating` ใส่ `restaurants.rating`

**ฝั่งลูกค้า**
- หน้า order detail/history: ปุ่ม "ให้คะแนน" หลัง status=delivered (ถ้ายังไม่ review)
- Dialog: ดาวร้าน + ดาวไรเดอร์ + comment

**หน้าใหม่: `restaurant.reviews.tsx`**
- ลิสต์รีวิว, filter ตามดาว, แสดง comment + order ref
- ฟอร์มตอบกลับ (inline) + แสดง owner_reply
- สรุป: avg rating, จำนวนรีวิว, distribution 1-5 ดาว

---

## เทคนิค & ข้อตกลง

- ทุกหน้า `restaurant.*` อยู่ใต้ `_app` (auth) + เช็คว่า user เป็น owner ของร้าน → redirect ถ้าไม่ใช่
- ใช้ TanStack Query + Supabase realtime subscription (cleanup ใน useEffect return)
- ไฟล์เสียงแจ้งเตือน: ใช้ Web Audio API gen tone หรือ asset .mp3 สั้นๆ
- ไม่แตะ: ระบบไรเดอร์, admin panel, payment gateway, multi-restaurant per owner

---

## ลำดับงานในรอบนี้
1. Migration (Phase 2 + 3B + 4 รวมเป็นชุดเดียว ขออนุมัติครั้งเดียว)
2. Phase 2 (orders dashboard + realtime + เสียง)
3. Phase 3A (analytics)
4. Phase 3B (promotions: หน้าจัดการ + integration ในตะกร้า)
5. Phase 4 (reviews: ฝั่งลูกค้า + ฝั่งร้าน)
6. อัปเดต restaurant-dashboard ให้ลิงก์ครบ

ยืนยันให้ลุยทั้ง 3 เฟสรวดเดียวเลยมั้ยครับ หรืออยากให้หยุดพักรีวิวระหว่างเฟส?
