# Order Flow ใหม่ — Parallel Confirmation ก่อนจ่ายเงิน

## สรุป flow ใหม่ (ตามที่ตกลง)

```text
[customer create]
        ↓
awaiting_confirmations   ← ร้านเห็น + ไรเดอร์เห็นใน pool พร้อมกันทันที
   ├── ร้านกด "ยืนยันออเดอร์"   → set restaurant_accepted_at
   └── ไรเดอร์กด "รับงาน"        → set rider_id + rider_accepted_at  (ผูกพันยาว)
        ↓ เมื่อ "ครบทั้งคู่" — trigger auto-transition
awaiting_payment         ← ลูกค้าเห็น QR PromptPay
        ↓ ลูกค้า upload สลิป
awaiting_payment_confirm
        ↓ ร้านยืนยันสลิป
preparing                ← ไรเดอร์ได้ noti "ร้านเริ่มทำแล้ว มุ่งหน้าไปร้านได้" (ไม่ต้องกดยืนยันรอบสอง)
        ↓ ร้านกด "พร้อมส่ง"
ready
        ↓ ไรเดอร์รับของ
picked_up → delivering → delivered (OTP RPC เดิม)
```

`cancelled` ทำได้ตลอดก่อน `preparing` (ลูกค้ายกเลิกเอง / ร้านปฏิเสธ / ไรเดอร์ปล่อยงานก่อนจ่าย)

## การเปลี่ยน Schema

1. เพิ่ม value `awaiting_confirmations` ใน enum `order_status` (วางก่อน `awaiting_restaurant` ซึ่งจะ deprecate)
2. เพิ่ม column `orders.rider_accepted_at timestamptz`
3. เก็บ `awaiting_restaurant` ไว้ใน enum ก่อน (backward compat กับ order เก่า) แต่ flow ใหม่ไม่ใช้แล้ว
4. Default status ของ order ใหม่ → `awaiting_confirmations`

## Trigger / RPC

- **BEFORE INSERT trigger** บน `orders`: ถ้า status ไม่ระบุ → set `awaiting_confirmations`
- **AFTER UPDATE trigger** บน `orders`: เมื่อ `restaurant_accepted_at IS NOT NULL AND rider_id IS NOT NULL AND status = 'awaiting_confirmations'` → auto set `status = 'awaiting_payment'`
- **RPC `rider_claim_order(order_id uuid)`** (SECURITY DEFINER) — ทางเดียวที่ไรเดอร์ผูกตัวเองกับงานในช่วงนี้:
  - ตรวจ `auth.uid()` มี role `rider` + approved
  - atomic `UPDATE orders SET rider_id = auth.uid(), rider_accepted_at = now() WHERE id = $1 AND rider_id IS NULL AND status = 'awaiting_confirmations' RETURNING id`
  - ป้องกัน race condition (หลายไรเดอร์กดพร้อมกัน)
- **RPC `restaurant_accept_order(order_id uuid)`** (SECURITY DEFINER) — สำหรับร้านกดยืนยันรอบแรก (ก่อนจ่ายเงิน) เพื่อ trigger คำนวณ auto-transition ฝั่ง DB

## RLS updates

- `Customers view own orders`: เพิ่มเงื่อนไข rider pool ให้เห็น `status = 'awaiting_confirmations' AND rider_id IS NULL` ด้วย (จาก `ready/preparing` เดิม)
- Trigger `enforce_orders_update_authorization` ปัจจุบัน: เพิ่ม branch ให้ไรเดอร์ที่ assigned แล้ว update status `picked_up`/`delivering` ได้เหมือนเดิม + อนุญาตให้ "ปล่อยงาน" (set rider_id = NULL) **ก่อน** payment เท่านั้น (ใน `awaiting_confirmations` / `awaiting_payment`) — ผ่าน RPC แยก `rider_release_order` (optional, มีไว้กรณีไรเดอร์เปลี่ยนใจก่อนลูกค้าจ่าย)
- Customer cancel: ขยาย allowed transition ให้ cancel ได้จาก `awaiting_confirmations` ด้วย

## UI changes ฝั่ง happyeat

- **`src/routes/_app/cart.tsx`**: order ที่สร้างใหม่ → status `awaiting_confirmations` (เลิกใช้ `pending`/`awaiting_restaurant`)
- **`src/routes/_app/orders.tsx`** (ฝั่งลูกค้า): เพิ่ม UI สำหรับ `awaiting_confirmations` แสดง 2 chip คู่ขนาน:
  - "⏳ รอร้านยืนยัน" / "✓ ร้านยืนยันแล้ว"
  - "🔍 กำลังหาไรเดอร์" / "✓ ได้ไรเดอร์: {ชื่อ}"
  - ข้อความช่วยเหลือ: "รอเป็นพิเศษ? โทรหาร้านได้ที่ {เบอร์}" + ปุ่ม "ยกเลิกออเดอร์"
- **`src/routes/_app/restaurant.orders.tsx`** (ฝั่งร้าน): แทนปุ่ม "รับออเดอร์" เดิม → ปุ่ม "ยืนยันออเดอร์" เรียก `restaurant_accept_order` RPC; UI แยก section ใหม่ "รอยืนยัน (ก่อนจ่าย)"
- **`src/lib/order-status.ts`**: เพิ่ม label/variant สำหรับ `awaiting_confirmations`

## UI changes ฝั่ง HappyRider (rider room — ต้องแจ้ง)

- หน้า rider-dashboard query pool order: เพิ่ม `awaiting_confirmations AND rider_id IS NULL` (เดิมเป็น `ready`/`preparing`)
- ปุ่ม "รับงาน" → เรียก `rider_claim_order(order_id)` RPC แทน UPDATE ตรงๆ
- หลังรับงาน: หน้างานของฉัน แสดง status flow ใหม่ — ระหว่าง `awaiting_payment` / `awaiting_payment_confirm` แสดงข้อความ "รอลูกค้าจ่ายเงิน อย่าเพิ่งไปร้าน"
- เมื่อ status เข้า `preparing` → noti "ร้านเริ่มทำแล้ว มุ่งหน้าไปร้านได้" (ไม่มีปุ่มยืนยันรอบสอง)
- เก็บ flow `picked_up → delivering → delivered (RPC)` เดิมไว้ทุกอย่าง

## Push notifications

- เมื่อลูกค้า create order → noti ไปที่ "ร้าน + ไรเดอร์ใกล้ 3 คน" พร้อมกัน (เดิม `notifyRidersOrderReady` ยิงตอน `ready` — ต้องเพิ่มฟังก์ชันใหม่ `notifyRestaurantNewOrder` + ยิง rider เร็วขึ้น)
- เมื่อร้าน accept + ไรเดอร์ claim ครบ → noti กลับหาลูกค้า "จ่ายเงินได้แล้ว"
- เมื่อลูกค้าจ่าย → noti ร้าน "มีสลิปรอตรวจ"
- เมื่อร้านยืนยันสลิป → noti ไรเดอร์ที่ผูกไว้แล้ว "ร้านเริ่มทำ มุ่งหน้าไปได้"

## Migration ที่จะรัน (ขั้นตอนเดียว)

1. `ALTER TYPE order_status ADD VALUE 'awaiting_confirmations'`
2. `ALTER TABLE orders ADD COLUMN rider_accepted_at timestamptz`
3. เปลี่ยน DEFAULT ของ `orders.status` → `'awaiting_confirmations'`
4. สร้าง RPC `rider_claim_order`, `restaurant_accept_order`, `rider_release_order`
5. สร้าง AFTER UPDATE trigger สำหรับ auto-transition
6. แก้ RLS `Customers view own orders` + trigger `enforce_orders_update_authorization` รองรับ transition ใหม่

## SHARED_CONTRACT.md

อัปเดต §3 (State Machine), §4 (Responsibility), §5 (RLS), §8 (Changelog) — บอกห้อง rider ให้แก้ตามรายการข้างต้น

## Open question

ออเดอร์เก่าที่ค้างอยู่ในระบบ (status เดิม `awaiting_restaurant` / `pending`) จะให้:
- (A) ปล่อยให้จบ flow เก่าไป (เก็บ status เก่าใน enum) — แนะนำ เพราะปลอดภัยสุด
- (B) บังคับ migrate รวมเป็น flow ใหม่ทันที — มีโอกาสกระทบ order ที่กำลังทำอยู่

ผมจะใช้ (A) เป็น default ถ้าไม่ทักท้วง
