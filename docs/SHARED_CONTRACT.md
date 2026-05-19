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

## 3. Order State Machine (parallel-confirmation, payment-first)

```
[customer create order] → status = 'awaiting_confirmations', rider_id = NULL
        │
        ├─ ร้านเห็นทันที (tab "ออเดอร์ใหม่")  → กด "ยืนยัน" → RPC restaurant_accept_order()
        │                                       (เซ็ต restaurant_accepted_at)
        └─ ไรเดอร์เห็นทันที (pool)             → กด "รับงาน" → RPC rider_claim_order()
                                                 (เซ็ต rider_id + rider_accepted_at)

   เมื่อ "ทั้งสองฝั่ง" ครบ (restaurant_accepted_at IS NOT NULL AND rider_id IS NOT NULL)
   → trigger auto_transition_to_payment เปลี่ยน status เป็น 'awaiting_payment' อัตโนมัติ
   → ฝั่งที่กดเป็นคนสุดท้าย รับผิดชอบส่ง push แจ้งลูกค้า "จ่ายเงินได้แล้ว"
        ↓
awaiting_payment           ← ลูกค้าเห็น QR PromptPay
        ↓ ลูกค้า upload สลิป
awaiting_payment_confirm   ← รอร้านตรวจสลิป
        ↓ ร้านยืนยัน                ↓ ปฏิเสธสลิป → payment_rejected
preparing                  ← ร้านเริ่มทำอาหาร  (happyeat ยิง push หาไรเดอร์ที่ผูกแล้ว)
        ↓
ready                      ← อาหารพร้อม
        ↓
picked_up                  ← ไรเดอร์รับของจากร้านแล้ว (assigned rider UPDATE)
        ↓
delivering                 ← (optional) ระหว่างเดินทาง
        ↓ OTP 4 หลัก ผ่าน RPC confirm_delivery
delivered                  ← ไรเดอร์รับค่าส่งจาก customer ที่ปลายทาง
```

**Status `awaiting_restaurant` = LEGACY** เก็บไว้สำหรับ order เก่าก่อน 2026-05-17 เท่านั้น order ใหม่จะไม่เข้า state นี้อีก

**Rider release ก่อนจ่าย:** ไรเดอร์ปล่อยงานได้ผ่าน RPC `rider_release_order(_order_id)` เฉพาะตอน status ยัง `awaiting_confirmations` หรือ `awaiting_payment` (ลูกค้ายังไม่จ่ายเงิน) — จะเซ็ต `rider_id=NULL, rider_accepted_at=NULL` กลับ order เข้า pool อีกครั้ง

`cancelled` ได้ทุก state **ก่อน** `preparing` (รวม `awaiting_confirmations` — ลูกค้ายกเลิกได้ระหว่างรอ confirmation)

---

## 4. ขอบเขตความรับผิดชอบ (ใครแก้อะไรได้)

| สิ่งที่ทำ | Customer/Restaurant app | Rider app |
|---|---|---|
| สร้าง order (status เริ่มต้น = `awaiting_confirmations`) | ✅ ลูกค้า | ❌ |
| ร้านยืนยัน → set `restaurant_accepted_at` | ✅ ร้าน (RPC `restaurant_accept_order`) | ❌ |
| ไรเดอร์รับงาน → set `rider_id`, `rider_accepted_at` | ❌ | ✅ (RPC `rider_claim_order`) |
| ไรเดอร์ปล่อยงานก่อนจ่าย | ❌ | ✅ (RPC `rider_release_order`) |
| Auto `awaiting_confirmations → awaiting_payment` | trigger DB ทำให้เอง | trigger DB ทำให้เอง |
| Push "จ่ายเงินได้แล้ว" หา customer | ✅ ถ้าฝั่งร้านเป็นคน trigger transition | ✅ ถ้าฝั่งไรเดอร์เป็นคน trigger transition |
| Upload สลิป, ย้ายไป `awaiting_payment_confirm` | ✅ ลูกค้า | ❌ |
| ยืนยันสลิป → `preparing` | ✅ ร้าน (+ ยิง push หาไรเดอร์ที่ผูกแล้ว) | ❌ |
| `preparing → ready` | ✅ ร้าน | ❌ |
| `ready → picked_up` | ❌ | ✅ (assigned rider UPDATE) |
| GPS update | ❌ | ✅ |
| `picked_up → delivering` | ❌ | ✅ (UPDATE ตรงๆ) |
| `delivering → delivered` + OTP verify | ❌ | ✅ **เฉพาะผ่าน RPC `confirm_delivery`** |
| สร้าง review | ✅ ลูกค้า | ❌ |
| แก้ไข `riders` table | ❌ | ✅ |
| แก้ไข `restaurants`, `menu_*` | ✅ | ❌ |

---

## 5. RLS ที่ทั้ง 2 ฝั่งต้องเข้าใจตรงกัน

`orders` policy `Customers view own orders` อนุญาต:
- `auth.uid() = customer_id` — ลูกค้าเจ้าของ
- `auth.uid() = rider_id` — ไรเดอร์ที่รับงานนั้น
- เจ้าของร้าน (ผ่าน `restaurants.owner_id`)
- **ไรเดอร์ทุกคน เห็น order ที่ `rider_id IS NULL AND status IN ('awaiting_confirmations','ready','preparing')`** ← pool งานใหม่ (`awaiting_confirmations` เพิ่มเข้ามาเพื่อ flow parallel-confirmation)
- admin

`Restaurant/rider/customer update orders`: customer / เจ้าของร้าน / admin / ไรเดอร์ใดๆ ที่ `rider_id IS NULL` / ไรเดอร์ที่ assigned (เฉพาะ status `picked_up`, `delivering` — ห้าม set `delivered` ตรงๆ ต้องเรียก RPC `confirm_delivery`)

**Trigger `enforce_orders_update_authorization`** บล็อก rider โดยตรงไม่ให้ UPDATE field ที่ไม่ใช่ของตัวเอง → ใช้ RPC `rider_claim_order` / `rider_release_order` เท่านั้น สำหรับ flow รับ/ปล่อยงานก่อนจ่าย

> **คำเตือน:** ถ้า rider app จะเพิ่ม column ใหม่ใน `orders` ต้องมาขอห้องนี้ run migration + อัปเดต RLS

---

## 6. Realtime channels

- `orders` table อยู่ใน publication `supabase_realtime` แล้ว
- ทั้ง 2 แอป subscribe ได้ — RLS จะกรอง row ให้เอง (เพราะใช้ `postgres_changes` เท่านั้น)
- **ห้าม** ใช้ `broadcast` / `presence` จนกว่าจะเพิ่ม RLS บน `realtime.messages` ก่อน (ดู §6.1)

### 6.1 แผนรองรับ chat ไรเดอร์ ↔ ลูกค้า (ยังไม่ implement)

ตัดสินใจแล้วว่าจะทำเป็น **ephemeral broadcast** (ฟรี 100%, ไม่แตะ DB):
- Topic: `order-chat:{order_id}` — 1 channel ต่อ 1 ออเดอร์
- ใช้ `.send({ type: 'broadcast', event: 'message', payload: { text, sender } })`
- ไม่มี table เก็บข้อความ — ออฟไลน์ = พลาด, งานจบ (`delivered`/`cancelled`) = channel unsubscribe ข้อความหายหมด
- เหตุผลที่ไม่เก็บประวัติ: OTP 4 หลักคือหลักฐาน two-party confirmation อยู่แล้ว, แชทเป็นแค่เครื่องมือสื่อสารระหว่างทาง

**ก่อนเปิด chat ต้องทำพร้อมกัน:**
1. Migration เพิ่ม RLS บน `realtime.messages`: SELECT/INSERT policy ที่ extract `order_id` จาก topic (`split_part(topic, ':', 2)::uuid`) แล้วเช็คว่า `auth.uid()` อยู่ใน `orders.customer_id` หรือ `orders.rider_id` ของ order นั้น
2. ฝั่ง happyeat: หน้า `_app/orders.$orderId.tsx` เพิ่ม chat panel
3. ฝั่ง HappyRider: หน้า order detail เพิ่ม chat panel เดียวกัน
4. Auto-unsubscribe เมื่อ status เป็น `delivered`/`cancelled`

จนกว่าจะถึงตอนนั้น — finding `realtime_messages_no_rls` ถูก ignore เพราะตอนนี้ใช้แค่ `postgres_changes` ซึ่งกรองด้วย RLS ของ table อยู่แล้ว

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
| 2026-05-17 | happyeat | **NEW FLOW (parallel confirmation before payment)**: เพิ่ม enum value `awaiting_confirmations` (default status ของ order ใหม่) + column `orders.rider_accepted_at` + RPCs `restaurant_accept_order`, `rider_claim_order`, `rider_release_order` (SECURITY DEFINER) + trigger `auto_transition_to_payment` (เปลี่ยน status เป็น `awaiting_payment` อัตโนมัติเมื่อ `restaurant_accepted_at IS NOT NULL AND rider_id IS NOT NULL`). RLS `Customers view own orders` ขยาย rider pool ให้รวม `awaiting_confirmations`. ฝั่ง happyeat (restaurant.orders): tab "ออเดอร์ใหม่" + ปุ่มยืนยัน + push หา customer ตอน auto-transition + push หาไรเดอร์ที่ผูกแล้วตอน `confirmSlip → preparing`. ฝั่ง happyeat (orders): dual-chip restaurant/rider status + ปุ่มยกเลิก. | **rider app: action ด่วน** — (1) เปลี่ยน pool query รับงานให้รวม `status='awaiting_confirmations' AND rider_id IS NULL` (เดิมเป็น `'ready'/'preparing'`); (2) ปุ่ม "รับงาน" สำหรับ `awaiting_confirmations` ต้องเรียก RPC `supabase.rpc('rider_claim_order', { _order_id })` แทน UPDATE ตรง — return `true` = สำเร็จ, `false` = ถูกคนอื่นรับไปแล้ว/ไรเดอร์ยังไม่ approve; (3) เพิ่มปุ่ม "ปล่อยงาน" สำหรับ status `awaiting_confirmations` / `awaiting_payment` (ตอนรอลูกค้าจ่าย) → เรียก RPC `rider_release_order` — ใช้กรณีไรเดอร์เปลี่ยนใจก่อนงานจริง; (4) หลัง RPC `rider_claim_order` สำเร็จ ให้ re-fetch order — ถ้า status เป็น `awaiting_payment` แล้ว (ร้านยืนยันก่อนหน้า) ต้องเรียก server fn `sendStatusPush({ targetUserId: order.customer_id, title: "💳 จ่ายเงินได้แล้ว", body: "ร้านและไรเดอร์ยืนยันแล้ว — เปิดแอปสแกน QR ชำระเงิน", url: "/orders" })`; (5) เพิ่ม UI สถานะใหม่: "รอลูกค้าจ่ายเงิน" (awaiting_payment/awaiting_payment_confirm) และ "ร้านกำลังทำอาหาร" (preparing) — ไรเดอร์รอ push "ร้านเริ่มทำอาหารแล้ว" จาก happyeat ตอน `preparing` แล้วค่อยออกเดินทางไปร้าน |
| 2026-05-17 | happyeat | **PLAN (chat ephemeral broadcast)**: ตกลงสถาปัตยกรรม chat ไรเดอร์↔ลูกค้าแบบ ephemeral (ไม่เก็บ DB) ด้วย Realtime broadcast topic `order-chat:{order_id}`. ตอนนี้ยังไม่ implement — ดูรายละเอียดและเงื่อนไขใน §6.1. Finding `realtime_messages_no_rls` ถูก ignore เพราะปัจจุบันใช้แค่ `postgres_changes` (กรองด้วย RLS ของ table). | rider app: ไม่ต้อง action ตอนนี้ — แต่ถ้าจะเริ่มทำ chat **ต้องประสานกับห้องนี้ก่อน** เพื่อ run migration RLS บน `realtime.messages` พร้อมกัน |
| 2026-05-17 | happyeat | **SECURITY (orders customer column-level lockdown)**: เพิ่ม BEFORE UPDATE trigger `trg_enforce_orders_update_authorization` บน `orders`. ลูกค้า (customer_id = auth.uid()) **แก้ได้เฉพาะ** `notes`, `payment_slip_url`, `payment_submitted_at` และ status transition แค่ `awaiting_payment → awaiting_payment_confirm` กับ cancel ก่อน `preparing`. ฟิลด์เงิน/payment_confirmed_at/rider_id/delivery_otp ลูกค้าแตะไม่ได้. ร้าน/ไรเดอร์ที่ assigned/admin bypass ปกติ. Rider claim งาน (`rider_id NULL → auth.uid()`, status `ready/preparing → picked_up`) ยังทำได้เหมือนเดิม. | rider app: ไม่ต้อง action — flow รับงาน/ส่งงานเดิมยังผ่าน trigger ทั้งหมด ถ้า rider พยายามแก้ฟิลด์อื่นนอกเหนือ status/rider_id (ไม่ควรมีอยู่แล้ว) จะถูกบล็อก |
| 2026-05-17 | happyeat | **SECURITY (OTP server-side verify)**: สร้าง RPC `confirm_delivery(order_id uuid, otp_code text) RETURNS boolean` (SECURITY DEFINER) — เป็น **ทางเดียว** ที่จะ set `status='delivered'` ได้. ตรวจ OTP ในฐานข้อมูล + เช็ค `rider_id = auth.uid()` + status ปัจจุบันต้อง `picked_up` หรือ `delivering`. แก้ RLS `Restaurant/rider/customer update orders` ให้ไรเดอร์ที่ assigned UPDATE ได้เฉพาะ status `picked_up`/`delivering` — set `delivered` ตรงๆ จะถูกบล็อก. | **rider app: action ด่วน** — (1) ลบ `delivery_otp` ออกจากทุก SELECT query ใน orders (ไรเดอร์ไม่ต้องรู้ OTP อีกต่อไป), (2) เปลี่ยน flow ยืนยันส่ง: กรอก OTP 4 หลัก → เรียก `supabase.rpc('confirm_delivery', { order_id, otp_code })` → ถ้า `data === true` ถือว่าสำเร็จ ถ้า `false` แจ้ง "OTP ไม่ถูกต้อง", (3) ลบการเทียบ OTP ฝั่ง client ทิ้งทั้งหมด, (4) **อย่าพยายาม UPDATE status='delivered' ตรงๆ** — จะถูก RLS บล็อก |
| 2026-05-17 | happyeat | **SECURITY (rider self-approval bypass)**: เอา `is_approved: true` ออกจาก client insert ใน `rider-dashboard.tsx` + แก้ RLS `Riders insert own` บังคับ `is_approved=false AND is_online=false` ตอน insert, และ `Riders update own` ห้ามไรเดอร์เปลี่ยน `is_approved` ของตัวเอง (เฉพาะ admin). ไรเดอร์ใหม่ต้องรอ admin อนุมัติก่อนรับงานได้. | rider app: ถ้ามี code insert/update `riders.is_approved` ฝั่งไรเดอร์ ต้องลบทิ้ง — จะถูก RLS บล็อก |
| 2026-05-19 | happyeat | **NEW (force-update system)**: สร้างตาราง `app_config` (platform unique: `android`/`ios`/`web`, `latest_version`, `min_supported_version`, `apk_download_url`, `release_notes`, `force_update bool`). RLS: public read (anon+auth), admin-only write. seed row `platform='android'` แล้ว. Component `<ForceUpdateGate />` mount ใน `__root.tsx` — เช็คเฉพาะ native (Capacitor.isNativePlatform), อ่าน version จริงจาก `App.getInfo()` เทียบกับ `min_supported_version` ของ row platform ตัวเอง → ถ้าน้อยกว่า หรือ `force_update=true` → popup ปิดไม่ได้ + ปุ่มเปิด `apk_download_url` ผ่าน `Browser.open()`. คงที่ APP_VERSION อยู่ใน `src/lib/app-version.ts` — ต้อง bump ทุกครั้งที่ build APK ใหม่ให้ตรงกับ `versionName` ใน `android/app/build.gradle`. | **rider app: action ด่วน** — (1) สร้าง row ใหม่ใน `app_config` ผ่านหน้า Backend ของ Lovable Cloud: `platform='android'` แยกของไรเดอร์**ไม่ได้** (unique constraint) — ใช้ approach แทน: เปลี่ยน schema เป็น composite key (`platform` + `app_id`) หรือใช้ platform string ใหม่เช่น `'android_rider'`/`'android_customer'`. ห้องนี้แนะนำใช้ `'android_rider'` (ไม่ต้อง migration) — happyeat จะ migrate `'android'` → `'android_customer'` ให้ตอนห้องไรเดอร์พร้อม; (2) `bun add @capacitor/app @capacitor/browser`; (3) copy `src/lib/app-version.ts` + `src/components/ForceUpdateGate.tsx` จาก happyeat repo, แก้ query ให้เช็ค `platform='android_rider'`; (4) mount `<ForceUpdateGate />` ใน root layout; (5) ทุกครั้งที่ build APK ใหม่ → bump `APP_VERSION` ในโค้ด + อัปเดต row ตัวเองใน `app_config` (latest_version, apk_download_url, ถ้าจะบังคับให้ทุกคนอัปเดตให้ตั้ง min_supported_version = ตัวใหม่ หรือ force_update=true) |
| 2026-05-17 | happyeat | **FIX (storage RLS — payment-slips read)**: policy `Slip read by order parties` เดิมเขียนผิด เทียบ `storage.foldername(r.name)` (= ชื่อร้าน) แทน `storage.foldername(objects.name)` (= path ไฟล์) ทำให้เจ้าของร้าน/ลูกค้า/แอดมิน createSignedUrl สลิปไม่ได้ → หน้า "ตรวจสลิป" ค้างที่ "กำลังโหลด...". แก้แล้ว. | rider app: ไม่ต้อง action |
| 2026-05-17 | happyeat | **NEW (separate holder name per QR mode)**: เพิ่ม `restaurants.promptpay_qr_holder_name text` — เก็บชื่อบัญชีสำหรับโหมด `qr_image` แยกจาก `promptpay_holder_name` (โหมด `id`) เพื่อกันข้อมูลทับกันเวลาร้านสลับโหมด. หน้า orders เลือก field ตาม `promptpay_mode` ก่อนส่งให้ `PaymentPanel`. | rider app: ไม่ต้อง action (ไรเดอร์ไม่เกี่ยวกับ payment QR) |
| 2026-05-17 | happyeat | **NEW (restaurant payment QR options)**: เพิ่ม `restaurants.promptpay_mode text default 'id'` (`id` \| `qr_image`) + `restaurants.promptpay_qr_url text`. ร้านเลือกได้ว่าจะให้ระบบ generate QR จากเบอร์ PromptPay (โหมดเดิม — มียอดเงินฝัง) หรืออัปโหลดรูป QR ของตัวเอง (static — ลูกค้าต้องพิมพ์ยอดเอง). หน้า checkout/orders เช็คโหมดเพื่อเลือก validation + UI. | rider app: ไม่ต้อง action (ไรเดอร์ไม่เกี่ยวกับเงินค่าอาหาร — รับเฉพาะค่าส่งปลายทางตามเดิม) |
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
