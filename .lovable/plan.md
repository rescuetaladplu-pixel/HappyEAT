
# Distance-based dispatch + dynamic delivery fee

## 1. สูตรค่าส่ง (option A — fractional, ceil บาท)

```
0–4 กม.    : 35฿  (flat)
> 4–7 กม.  : +6฿/กม. (fraction)
> 7–10 กม. : +7฿/กม.
> 10+ กม.  : +8฿/กม.
ผลรวมท้ายสุด → Math.ceil() เป็นบาทเต็ม
```

ตรวจ: 4.3→37฿ · 5→41฿ · 7→53฿ · 8.2→62฿ · 10→74฿ · 12→90฿

ไฟล์ใหม่ `src/lib/delivery-fee.ts` (pure function ใช้ทั้ง client preview + server)

## 2. ระยะทางที่ใช้ (ร้าน → ที่อยู่ลูกค้า)

- คำนวณตอน checkout ผ่าน OSRM `route` API (ฟรี, ใช้อยู่แล้วในโปรเจกต์)
- เก็บลง `orders.delivery_distance_km` (column ใหม่) ตอน insert
- ถ้า OSRM ล่ม → fallback haversine × 1.3 (กันราคาผิด)
- หน้า cart: เรียก preview ฟังก์ชัน `previewDeliveryFee(restaurantId, lat, lng)` แบบ debounce 500ms เมื่อ address เปลี่ยน

## 3. Wave dispatch (4→4→6→8 กม.)

| Wave | t (วิ) | รัศมี | กลุ่มเป้าหมาย |
|------|-------|------|---------------|
| 0 | 0    | 4 กม. | 3 คนใกล้สุด |
| 1 | 15   | 4 กม. | **ทุกคน** ในรัศมี |
| 2 | 30   | 6 กม. | ทุกคน |
| 3 | 45   | 8 กม. | ทุกคน |
| 4 | 60   | — | เปิด UI ลูกค้าเพิ่มค่าส่ง |

### Schema เพิ่ม (`orders`)
- `delivery_distance_km numeric`
- `dispatch_wave smallint default 0`
- `last_dispatched_at timestamptz default now()`
- `delivery_fee_boost numeric default 0` (ลูกค้าเพิ่มเอง, รวมเข้า `delivery_fee` ตอนแสดง/แจ้งไรเดอร์)
- `awaiting_rider_boost boolean default false` (true เมื่อหลัง wave 4)

### กลไก
- Cron `pg_cron` ทุก 15 วินาที → POST `/api/public/hooks/dispatch-tick`
- Handler: SELECT orders ที่ `status='awaiting_confirmations' AND rider_id IS NULL AND now() - last_dispatched_at >= 14s AND dispatch_wave < 4`
  - แต่ละ order: เลื่อน wave +1 → คำนวณ candidate riders ตามตาราง → ยิง push → UPDATE `dispatch_wave`, `last_dispatched_at`
  - wave 4: ไม่ยิง push, เซ็ต `awaiting_rider_boost=true` ส่ง realtime ให้ลูกค้า
- Wave 0 ยังยิงทันทีตอน create order (เหมือนเดิม) — cron จะหยิบ wave ถัดไป

### Push เลือกไรเดอร์ตาม radius
ย้าย logic ปัจจุบันใน `notifyRidersOrderReady` → helper `selectRidersWithinKm(pickupLat, pickupLng, maxKm, limit?)`
- wave 0: limit=3
- wave 1-3: limit=undefined (ทุกคน)
- ใช้ OSRM `table` service กรอง driving distance ≤ maxKm

## 4. ลูกค้าเพิ่มค่าส่ง (+10฿)

เมื่อ `awaiting_rider_boost=true` แสดง card บนหน้า `/orders/$orderId`:

> **ตอนนี้ไรเดอร์ใกล้คุณว่างน้อย** 🛵
> ลองเพิ่มค่าส่งสักหน่อยเพื่อเป็นกำลังใจให้ไรเดอร์ที่ไกลขึ้นมารับงานนะคะ — ค่าส่งที่เพิ่มจะเข้าตรงไปที่ไรเดอร์ ไม่ผ่านระบบของเรา
>
> ค่าส่งปัจจุบัน: ฿XX
> [+10฿] [+20฿] [+30฿]  → ปุ่ม "ยืนยันเพิ่ม ฿YY"

กลไก:
- กดยืนยัน → server fn `boostDeliveryFee(orderId, amount)`:
  - UPDATE `delivery_fee_boost += amount`, `delivery_fee += amount`, `total += amount`, `dispatch_wave = 3`, `last_dispatched_at = now() - 14s`, `awaiting_rider_boost=false`
  - ยิง push wave ใหม่ทันทีให้ไรเดอร์ทุกคนในรัศมี 8 กม. (title โชว์ค่าส่งใหม่)
- ลูกค้าเพิ่มกี่รอบก็ได้ — ทุกครั้งจะ trigger push wave ใหม่
- ถ้ายังไม่มีคนรับใน 60 วิ → cron เซ็ต `awaiting_rider_boost=true` อีกครั้ง

## 5. ไฟล์ที่กระทบ

| ไฟล์ | การเปลี่ยน |
|------|-----------|
| `src/lib/delivery-fee.ts` | **ใหม่** — pure tier calculator |
| `src/lib/dispatch.functions.ts` | **ใหม่** — `previewDeliveryFee`, `boostDeliveryFee`, `selectRidersWithinKm` |
| `src/routes/api/public/hooks/dispatch-tick.ts` | **ใหม่** — cron handler |
| `src/lib/fcm.functions.ts` | refactor `notifyRidersOrderReady` → ใช้ `selectRidersWithinKm`, รับ `radiusKm`+`limit` |
| `src/routes/_app/cart.tsx` | ลบ hardcode 30฿ → ใช้ `previewDeliveryFee`, เก็บ `delivery_distance_km` ตอน insert |
| `src/routes/_app/orders.$orderId.tsx` | เพิ่ม boost UI เมื่อ `awaiting_rider_boost=true` |
| migration | เพิ่ม 4 columns + enable `pg_cron`/`pg_net` + schedule job |
| `docs/SHARED_CONTRACT.md` | changelog + แจ้ง rider room |

## 6. Cross-app impact (HappyRider)

- ไรเดอร์ไม่ต้อง action อะไรกับ wave logic (push มาให้เอง)
- **ต้องอัปเดต UI list งาน:** โชว์ `delivery_fee` (ที่รวม boost แล้ว) — query เดิมดึง