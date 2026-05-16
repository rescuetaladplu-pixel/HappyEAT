
# ระบบชำระเงิน QR + ยืนยัน 2 ขั้นตอน

## Flow ใหม่

```
1. ลูกค้าเลือกอาหาร → กด "เสนอคำสั่งซื้อ"
   └─ status: awaiting_restaurant
2. ร้านได้ notification → ตรวจรายการ → กด "รับออเดอร์ พร้อมทำ" หรือ "ปฏิเสธ"
   └─ status: awaiting_payment (ถ้ารับ) | rejected
3. ลูกค้าได้ notification → เห็นหน้า QR PromptPay (ยอด = ค่าอาหาร) → สแกนจ่าย → upload สลิป → กด "ส่งสลิป"
   └─ status: awaiting_payment_confirm
4. ร้านได้ notification → เปิดดูสลิป + เช็ค app ธนาคาร → กด "ยืนยันรับเงิน เริ่มทำ" หรือ "ปฏิเสธสลิป"
   └─ status: preparing (เริ่มทำอาหาร) | payment_rejected
5. ขั้นตอนเดิมต่อไป: preparing → ready → picked_up → delivered
```

## State machine (order_status enum เพิ่มใหม่)

```
pending (เดิม - ยังใช้ได้สำหรับ COD)
  ↓
awaiting_restaurant   ← ขั้นที่ 1: รอร้านเช็คความพร้อม
  ↓ ร้านรับ
awaiting_payment      ← ขั้นที่ 2: รอลูกค้าจ่าย + upload สลิป
  ↓ ลูกค้าส่งสลิป
awaiting_payment_confirm  ← ขั้นที่ 3: รอร้านยืนยันสลิป
  ↓ ร้านยืนยัน
preparing → ready → picked_up → delivered
  
(ทุกขั้นก่อน preparing สามารถ → cancelled ได้ทั้งสองฝ่าย)
```

## Database changes

**orders** (เพิ่ม column)
- `payment_method` ขยายค่า: `'cash' | 'promptpay_qr'`
- `payment_slip_url` text — URL สลิปใน storage
- `payment_submitted_at` timestamptz — เวลาลูกค้าส่งสลิป
- `payment_confirmed_at` timestamptz — เวลาร้านยืนยัน
- `restaurant_accepted_at` timestamptz — เวลาร้านรับออเดอร์ (ขั้น 1)
- `rejection_reason` text — เหตุผลปฏิเสธ (ร้าน/สลิป)

**restaurants** (เพิ่ม column)
- `promptpay_id` text — เบอร์โทร 10 หลัก หรือเลขบัตร ปชช. 13 หลัก
- `promptpay_holder_name` text — ชื่อบัญชี (โชว์ให้ลูกค้าเห็นก่อนโอน)

**order_status enum** เพิ่ม 3 ค่า: `awaiting_restaurant`, `awaiting_payment`, `awaiting_payment_confirm`, `payment_rejected`

**Storage bucket ใหม่**: `payment-slips` (private — เฉพาะลูกค้าเจ้าของ + ร้านปลายทาง + admin อ่านได้)

## หน้าจอที่ต้องสร้าง/แก้

### Customer side
1. **Cart checkout** (`/cart`) — เพิ่มตัวเลือก payment_method (cash / PromptPay QR). ถ้าเลือก QR → status เริ่มที่ `awaiting_restaurant` แทน `pending`
2. **Order detail / `/orders`** — เพิ่ม UI ตาม state:
   - `awaiting_restaurant`: แสดง "รอร้านยืนยันความพร้อม..." + spinner
   - `awaiting_payment`: แสดง QR (generate ฝั่ง client), ยอด, ชื่อบัญชี, ปุ่ม upload สลิป + ปุ่มส่ง
   - `awaiting_payment_confirm`: แสดงสลิปที่ส่งแล้ว + "รอร้านยืนยัน..."
   - `payment_rejected` / `rejected`: แสดงเหตุผล + ปุ่มลองใหม่/ยกเลิก

### Restaurant side (`/restaurant/orders`)
- เพิ่ม tab/section: **ออเดอร์ใหม่ (รอรับ)**, **รอชำระเงิน**, **รอตรวจสลิป**, **กำลังทำ** ฯลฯ
- การ์ด `awaiting_restaurant`: ดูรายการ → ปุ่ม "รับออเดอร์" / "ปฏิเสธ"
- การ์ด `awaiting_payment_confirm`: เปิดดูสลิป (เต็มจอ zoom ได้) + ยอดที่ต้องตรวจ + ปุ่ม "ยืนยันรับเงิน" / "ปฏิเสธสลิป"

### Restaurant settings (`/my-restaurant/settings`)
- เพิ่มฟิลด์ **PromptPay** (เบอร์/เลขบัตร) + **ชื่อบัญชี** — บังคับกรอกถ้าจะรับชำระแบบ QR

## Tech / libraries

- **promptpay-qr** (npm) — generate PromptPay payload ฟรี, pure JS
- **qrcode** (npm) — render เป็น SVG/canvas ใน browser
- **Push notification** — ใช้ FCM ที่มีอยู่แล้ว (`sendOrderPush`) — trigger ทุกครั้งที่ status เปลี่ยนแบบที่อีกฝั่งต้อง action

## RLS / Security
- ลูกค้า upload สลิปได้เฉพาะ order ของตัวเอง + เฉพาะ state `awaiting_payment`
- ร้านเปลี่ยน status ได้เฉพาะ transition ที่กำหนด (ใช้ validation trigger)
- ไม่ใช้ CHECK constraint กับเวลา — ใช้ trigger
- bucket `payment-slips` private + policy: customer/restaurant_owner/admin เท่านั้น

## ขอบเขตในรอบนี้ (ไม่รวม)

- ระบบบทลงโทษ/แบนร้าน — รอ user คิดทีหลัง
- Auto-cancel timer — รอ user ตัดสินใจทีหลัง
- ระบบคืนเงินอัตโนมัติ — ไม่มีในรอบนี้ (ทุก state ก่อน `awaiting_payment_confirm` ยกเลิกได้ฟรีเพราะลูกค้ายังไม่จ่าย)

## ลำดับการ implement

1. Migration: enum + columns + storage bucket + RLS
2. Restaurant settings: ฟอร์ม PromptPay
3. Cart: เพิ่มตัวเลือก payment_method
4. Customer order detail: QR + upload สลิป
5. Restaurant orders panel: 2 ปุ่มยืนยัน (รับออเดอร์ / ยืนยันสลิป)
6. Push notification triggers ทุก state transition

---

ถ้าโอเค กดอนุมัติเพื่อเริ่ม implement ได้เลยครับ
