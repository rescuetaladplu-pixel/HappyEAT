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
| 2026-05-16 | ทั้ง 2 ฝั่ง | **CLARIFY (FCM token sharing)**: ไรเดอร์ใช้ table `fcm_tokens` ตัวเดียวกับ customer/restaurant — row ของไรเดอร์ใช้ `user_id = rider auth.uid`, `restaurant_id = NULL`. RLS อนุญาตให้ user upsert token ของตัวเองได้อยู่แล้ว ไม่ต้อง migration เพิ่ม. ฝั่งไรเดอร์แค่ copy `public/firebase-messaging-sw.js` (เปลี่ยน default url notificationclick → `/rider-dashboard`), copy `src/lib/firebase-client.ts` (Firebase config + VAPID key เหมือนกัน), แล้วเรียก `registerFcmToken({ token, restaurantId: null })` ตอนไรเดอร์กด enable push. `notifyRidersOrderReady` query `fcm_tokens.user_id IN (picked riders)` ได้เลย. | rider app: เพิ่ม service worker + firebase-client + EnablePushButton บน rider-dashboard ตามที่อธิบายข้างต้น |
| 2026-05-16 | happyeat | **UPDATE (Phase 4.1 — nearest-3 dispatch)**: `notifyRidersOrderReady` เปลี่ยนจาก broadcast ทุกคน → ส่งเฉพาะ **ไรเดอร์ออนไลน์ที่อยู่ใกล้ร้านที่สุด 3 คน** (Haversine จาก `restaurants.latitude/longitude` ↔ `riders.current_lat/current_lng`). ไรเดอร์ที่ไม่มี GPS จะถูกจัดอันดับท้ายสุด (ใช้เติมโควต้า 3 คนถ้าคนมี GPS ไม่ครบ). "ใครกดรับก่อนได้ก่อน" ยังคงทำงานผ่าน atomic `UPDATE orders SET rider_id=auth.uid() WHERE rider_id IS NULL` ตาม RLS เดิม. | rider app: **สำคัญมาก** — ต้อง update `riders.current_lat/current_lng` ทุกครั้งที่ไรเดอร์ online (เช่น watchPosition ทุก 30 วินาที) ไม่งั้นจะถูกจัดอันดับเป็น Infinity และเสียโอกาสรับงาน |
| 2026-05-16 | happyeat | **NEW (Phase 4 — push lifecycle)**: ฝั่ง happyeat ยิง push ครบทุก transition ที่ร้านควบคุม — `accepted/preparing/ready/cancelled` → ลูกค้า, และ **`ready` → broadcast ไปไรเดอร์ออนไลน์+อนุมัติแล้วทุกคน** (ผ่าน server fn `notifyRidersOrderReady` query `riders where is_online=true and is_approved=true` แล้วยิง FCM ไปทุก token ของ user_id เหล่านั้น). ลูกค้ามีปุ่ม `EnablePushButton` ในหน้า `/orders` แล้ว. | rider app: (1) ฝั่งไรเดอร์ต้องเรียก `registerFcmToken` (server fn ใน happyeat repo — ไรเดอร์ login เข้า DB เดียวกัน sdk import ได้) หรือ **copy logic แบบเดียวกัน** insert/upsert เข้า `fcm_tokens` (user_id=rider auth.uid). (2) หน้า rider-dashboard ควรมี EnablePushButton เหมือนกัน. (3) push payload ที่มาจาก `notifyRidersOrderReady` มี `data.url=/rider-dashboard`, `data.orderId=<uuid>` — service worker จะเปิด `/rider-dashboard` เมื่อคลิก |
| 2026-05-16 | happyeat | **NEW**: เพิ่ม `restaurants.is_open_until timestamptz` — รองรับ feature เปิดร้านนอกเวลาทำการแบบ manual extension. logic อยู่ฝั่ง client (happyeat) ทั้งหมด: เจ้าของร้านกด switch เปิด → set `is_open=true, is_open_until=<next scheduled close>`. นอกเวลาทำการ ถ้า `is_open=true` และ `is_open_until` หมดอายุแล้ว → auto-flip เป็น false ตอนเจ้าของร้าน load หน้า dashboard. ลูกค้า/ร้าน คำนวณ `reallyOpen = is_open && (isOpenNow(oh) \|\| is_open_until > now())`. | rider app: ไม่ต้อง action (rider ไม่ใช้ field นี้ — งานจะ assign จาก order status `ready` ตามเดิม ไม่เกี่ยวกับสถานะเปิด/ปิดร้าน) |
| 2026-05-16 | happyeat | **NEW**: เพิ่ม `orders.delivery_otp text` + trigger `trg_generate_delivery_otp` — auto-generate รหัส 4 หลักเมื่อ status เปลี่ยนเป็น `ready`. ลูกค้าเห็น OTP ในหน้า `/orders` (state: ready/picked_up/delivering). | rider app: หน้ายืนยันส่งสำเร็จ ต้องให้ไรเดอร์กรอก OTP 4 หลัก แล้ว verify กับ `orders.delivery_otp` ก่อน update status → `delivered` (RLS อ่านได้เพราะเป็น assigned rider) |
| 2026-05-16 | ทั้ง 2 ฝั่ง | **DECISION (FINAL — ห้ามกลับมาคุยซ้ำ)**: Auth emails (signup confirm, password reset) ทุก role จะขึ้นชื่อ sender = "HappyEat" เพราะ Supabase Auth ใช้ project เดียว (HappyEat) + template เดียว. ไม่ setup custom email domain เพื่อรักษา ZERO maintenance cost (ต้องซื้อโดเมน + scaffold custom auth-email-hook ไม่คุ้ม). | rider app: ใส่ disclaimer บนหน้า signup success / verify email — "อีเมลยืนยันจะมาจาก HappyEat (ระบบเดียวกัน) กรุณาเช็คกล่องจดหมายและ spam folder" |
| 2026-05-16 | happyeat | **BREAKING**: `profiles.full_name` ถูกลบออก, แทนด้วย `first_name` + `last_name` (text). Trigger `handle_new_user` รับ `first_name`/`last_name` ใน metadata (ยัง fallback `full_name` ได้ชั่วคราว). | rider app: เปลี่ยน signup form ให้ส่ง `first_name`/`last_name` แทน `full_name`, และทุก query ที่ select `full_name` ต้องเปลี่ยนเป็น `first_name, last_name` แล้ว concat เอง |
| 2026-05-16 | happyeat | แก้ trigger `handle_new_user`: สมัคร role=`rider` หรือ `restaurant` จะไม่ถูกแถม role `customer` อีกต่อไป → แยกบัญชีกันชัดเจน (rider acct ใช้ฝั่ง eat ไม่ได้, ต้องสมัครใหม่) | rider app: signup ใหม่จะไม่มี customer role ติดมา — ถ้าโค้ดฝั่ง rider เคย assume ว่ามี customer role ต้องแก้ |
| 2026-05-16 | happyeat | สร้าง shared contract นี้, ตัด payment_method=`cash` ออก, ใช้ `promptpay_qr` อย่างเดียว | rider app: ลบ logic เงินสดค่าอาหาร (ถ้ามี); ค่าส่งยังเก็บเงินสด/QR ไรเดอร์ปลายทางได้ |

---

## 9. Workflow สำหรับ user (PM)

1. **แก้ฝั่ง customer/restaurant** → สั่งห้องนี้ → AI run migration (ถ้ามี) + อัปเดต changelog
2. **แก้ฝั่ง rider** → สั่งห้อง rider → AI ฝั่งนั้นทำเฉพาะ UI/logic
   - ถ้าต้อง migration → กลับมาสั่งห้องนี้
   - ถ้า rule กระทบทั้ง 2 ฝั่ง → กลับมาบอกห้องนี้อัปเดต contract
3. **เริ่ม session ใหม่ห้องไหน** → AI จะอ่านไฟล์นี้ก่อนเสมอ (มี rule ใน Core Memory)
