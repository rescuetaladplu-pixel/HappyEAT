# HappyEat — Shared Contract (Customer/Restaurant App ⇄ Rider App)

> **Single source of truth** ระหว่าง 2 โปรเจกต์ Lovable ที่ใช้ Lovable Cloud (Supabase) **ตัวเดียวกัน**
> - **happyeat** (โปรเจกต์นี้) — Customer + Restaurant
> - **HappyRider** — Rider only
>
> **กฎ:** ทุกการเปลี่ยน schema / state machine / business rule ที่กระทบทั้ง 2 ฝั่ง ต้องอัปเดตไฟล์นี้ก่อน commit
> **เจ้าของ migration:** ห้องนี้ (happyeat) เท่านั้น — rider room ห้าม run migration เด็ดขาด
> **เจ้าของ doc นี้:** ห้องนี้ (happyeat) — rider room อ่านอย่างเดียว ถ้าจะแก้ต้องมาบอกห้องนี้

---

## 1. หลักเศรษฐกิจ (ห้ามฝ่าฝืน)

- **ZERO platform cost** — ไม่มี GP / commission
- รายได้แพลตฟอร์ม = โฆษณาในแอป + paid restaurant placement เท่านั้น
- เงินค่าอาหาร: ลูกค้า → ร้าน **โดยตรง** ผ่าน PromptPay QR (verify ด้วย SlipOK)
- เงินค่าส่ง: ลูกค้า → ไรเดอร์ **โดยตรง** ตอนรับของ (เงินสด / QR ไรเดอร์)
- เงินไม่เคยผ่าน platform → ไม่ต้องมี PSP license

---

## 2. Database Schema (สรุปเฉพาะที่ทั้ง 2 ฝั่งใช้ร่วมกัน)

### Tables
| Table | ใครใช้ |
|---|---|
| `profiles` | ทั้งคู่ |
| `user_roles` | ทั้งคู่ |
| `restaurants` | customer (อ่าน), restaurant (CRUD), rider (อ่าน pickup info) |
| `menu_items`, `menu_categories`, `menu_addon_groups`, `menu_addon_options` | customer (อ่าน), restaurant (CRUD) |
| `orders` | **ทั้ง 3 ฝั่ง** ← จุดประสานหลัก |
| `order_items` | customer/restaurant (สร้าง+อ่าน), rider (อ่าน) |
| `addresses` | customer |
| `riders` | rider (CRUD ของตัวเอง), customer (อ่านชื่อ/เบอร์), restaurant (อ่าน) |
| `reviews` | customer (สร้าง), restaurant/rider (อ่าน) |
| `fcm_tokens` | ทั้งคู่ — push notification |
| `promotions`, `order_promotions` | customer/restaurant |

### `orders` columns (สำคัญที่สุด)
```
id, customer_id, restaurant_id, rider_id,
delivery_address, delivery_lat, delivery_lng,
subtotal, delivery_fee, discount, total,
status (enum order_status),
payment_method ('promptpay_qr' only — cash ถูกตัดทิ้งแล้ว),
payment_slip_url, payment_submitted_at, payment_confirmed_at,
restaurant_accepted_at, rejection_reason,
notes, created_at, updated_at
```

### Enums
- **app_role**: `customer | restaurant | rider | admin`
- **order_status**: ดูส่วน State Machine ด้านล่าง

### Storage buckets
- `payment-slips` (private) — สลิป PromptPay
- `restaurant-images`, `menu-images`, `avatars` (เท่าที่มีในโปรเจกต์)

---

## 3. Order State Machine (ฉบับ payment-first, ไม่มีเงินสดค่าอาหาร)

```
[customer create order]
        ↓
awaiting_restaurant   ← รอร้านเช็คความพร้อม
        ↓ ร้านรับ                      ↓ ร้านปฏิเสธ → rejected/cancelled
awaiting_payment      ← ลูกค้าเห็น QR PromptPay
        ↓ ลูกค้า upload สลิป
awaiting_payment_confirm  ← รอร้านตรวจสลิป (หรือ SlipOK auto)
        ↓ ร้านยืนยัน                    ↓ ปฏิเสธสลิป → payment_rejected
preparing             ← ร้านเริ่มทำอาหาร
        ↓
ready                 ← **ไรเดอร์เริ่มเห็น order นี้** (RLS: rider_id IS NULL AND status='ready')
        ↓ ไรเดอร์กดรับงาน → set rider_id
picked_up             ← ไรเดอร์รับของจากร้านแล้ว
        ↓
delivering            ← (optional) ระหว่างเดินทาง
        ↓ ไรเดอร์ส่งถึง + customer ยืนยัน OTP 4 หลัก
delivered             ← ไรเดอร์รับค่าส่งจาก customer ที่ปลายทาง
```

`cancelled` ได้ทุก state **ก่อน** `preparing` (เพราะลูกค้ายังไม่จ่าย/จ่ายแล้วแต่ร้านยังไม่ทำ)

---

## 4. ขอบเขตความรับผิดชอบ (ใครแก้อะไรได้)

| สิ่งที่ทำ | Customer/Restaurant app | Rider app |
|---|---|---|
| สร้าง order | ✅ | ❌ |
| ย้าย status `awaiting_restaurant → awaiting_payment` | ✅ ร้าน | ❌ |
| Upload สลิป, ย้ายไป `awaiting_payment_confirm` | ✅ ลูกค้า | ❌ |
| ยืนยันสลิป → `preparing` | ✅ ร้าน | ❌ |
| `preparing → ready` | ✅ ร้าน | ❌ |
| รับงาน (set `rider_id`, → `picked_up`) | ❌ | ✅ |
| GPS update (`delivery_lat/lng` หรือ realtime channel) | ❌ | ✅ |
| `picked_up → delivering → delivered` + OTP verify | ❌ | ✅ |
| สร้าง review | ✅ ลูกค้า | ❌ |
| แก้ไข `riders` table | ❌ | ✅ |
| แก้ไข `restaurants`, `menu_*` | ✅ | ❌ |

---

## 5. RLS ที่ทั้ง 2 ฝั่งต้องเข้าใจตรงกัน

`orders` policy `Customers view own orders` อนุญาต:
- `auth.uid() = customer_id` — ลูกค้าเจ้าของ
- `auth.uid() = rider_id` — ไรเดอร์ที่รับงานนั้น
- เจ้าของร้าน (ผ่าน `restaurants.owner_id`)
- ไรเดอร์ทุกคน เห็น order ที่ `rider_id IS NULL AND status IN ('ready','preparing')` ← **pool งาน**
- admin

`Restaurant/rider/customer update orders` อนุญาต customer / rider ที่ assigned / เจ้าของร้าน / ไรเดอร์ใดๆ ที่ `rider_id IS NULL` (สำหรับการกดรับงาน)

> **คำเตือน:** ถ้า rider app จะเพิ่ม column ใหม่ใน `orders` ต้องมาขอห้องนี้ run migration + อัปเดต RLS

---

## 6. Realtime channels

- `orders` table อยู่ใน publication `supabase_realtime` แล้ว
- ทั้ง 2 แอป subscribe ได้ — RLS จะกรอง row ให้เอง

---

## 7. ฟีเจอร์ที่ยังไม่มีในรอบนี้ (อย่าเพิ่งทำ)

- ระบบ ban ไรเดอร์/ร้านอัตโนมัติ
- Auto-cancel timer
- คืนเงินอัตโนมัติ (ไม่จำเป็น เพราะเงินไม่ผ่านระบบ)
- Tip ในแอป

---

## 8. Changelog

ทุกการเปลี่ยน schema / state / business rule ที่กระทบทั้ง 2 ฝั่ง — เพิ่มบรรทัดด้านล่าง (ใหม่สุดอยู่บนสุด)

| วันที่ | ฝั่งที่เปลี่ยน | สรุป | ใครต้อง action |
|---|---|---|---|
| 2026-05-16 | happyeat | สร้าง shared contract นี้, ตัด payment_method=`cash` ออก, ใช้ `promptpay_qr` อย่างเดียว | rider app: ลบ logic เงินสดค่าอาหาร (ถ้ามี); ค่าส่งยังเก็บเงินสด/QR ไรเดอร์ปลายทางได้ |

---

## 9. Workflow สำหรับ user (PM)

1. **แก้ฝั่ง customer/restaurant** → สั่งห้องนี้ → AI run migration (ถ้ามี) + อัปเดต changelog
2. **แก้ฝั่ง rider** → สั่งห้อง rider → AI ฝั่งนั้นทำเฉพาะ UI/logic
   - ถ้าต้อง migration → กลับมาสั่งห้องนี้
   - ถ้า rule กระทบทั้ง 2 ฝั่ง → กลับมาบอกห้องนี้อัปเดต contract
3. **เริ่ม session ใหม่ห้องไหน** → AI จะอ่านไฟล์นี้ก่อนเสมอ (มี rule ใน Core Memory)
