
## ภาพรวม

หน้า `/admin` ปัจจุบันรวมทุกอย่างไว้หน้าเดียว (stat 2 กลุ่ม + จัดการแอดมิน + ตารางผู้ใช้รวม). จะแยกเป็น **landing แอดมิน** + **2 หน้าย่อย** (Eat / Rider) เพื่อให้แต่ละฝั่งมีระบบจัดการเฉพาะของตัวเอง

```text
/admin                     → Landing: 2 การ์ดใหญ่ "จัดการฝั่ง Eat" / "จัดการฝั่ง Rider" + แถวสถิติสรุปทั้งระบบ
  ├── /admin/eat           → Dashboard ฝั่ง Eat
  └── /admin/rider         → Dashboard ฝั่ง Rider
  └── (ส่วนกลาง) สร้างแอดมิน + รายชื่อแอดมิน ย้ายไปอยู่ใน /admin landing (เพราะใช้ร่วมกัน)
```

---

## 1. `/admin` (Landing)

- Header: "แดชบอร์ดแอดมิน"
- แถวสถิติรวม 4 ตัว (compact): ออเดอร์รวม, ร้านค้า, ไรเดอร์, ผู้ใช้ทั้งหมด
- **2 การ์ดทางเข้าใหญ่** (grid 2 คอลัมน์ บนเดสก์ทอป / สแต็ก บนมือถือ):
  - 🍔 **จัดการฝั่ง Eat** — preview stat 3 ตัว (ออเดอร์วันนี้, ร้านรออนุมัติ, ลูกค้า) → ปุ่ม "เข้าจัดการ" → `/admin/eat`
  - 🛵 **จัดการฝั่ง Rider** — preview stat 3 ตัว (ไรเดอร์ออนไลน์, รออนุมัติ, กำลังส่ง) → ปุ่ม "เข้าจัดการ" → `/admin/rider`
- การ์ด "สร้างแอดมินใหม่" + "รายชื่อแอดมิน" คงไว้ที่ landing (เพราะเป็น meta-admin ไม่แยกฝั่ง)

## 2. `/admin/eat` (Dashboard ฝั่ง Eat)

ปุ่มย้อนกลับ → `/admin`

### สถิติ
- ออเดอร์รวมทั้งหมด / วันนี้ / สัปดาห์นี้
- ออเดอร์แยก status: `awaiting_restaurant`, `awaiting_payment_confirm`, `preparing`, `ready`, `delivered`, `cancelled`
- ร้านค้าทั้งหมด / รออนุมัติ (`is_approved=false`) / เปิดอยู่ตอนนี้ (`is_open=true`)
- ลูกค้าทั้งหมด

### ระบบจัดการ
- **ร้านรออนุมัติ** — รายการ `restaurants where is_approved=false` พร้อมปุ่ม "อนุมัติ" / "ปฏิเสธ" (delete)
- **ตารางร้านค้าทั้งหมด** — ค้นหา + filter (อนุมัติแล้ว / เปิดอยู่ / ปิด) + ปุ่ม "ดูร้าน", "ปิดใช้งาน"
- **ตารางผู้ใช้ฝั่ง Eat** — เฉพาะ role `customer` หรือ `restaurant` (filter จากตารางผู้ใช้รวมเดิม) พร้อมปุ่ม ยืนยันอีเมล / รีเซ็ตรหัสผ่าน เหมือนเดิม
- **ออเดอร์ล่าสุด** (10 รายการ) — ดู status, ลูกค้า, ร้าน, ยอด (read-only)

## 3. `/admin/rider` (Dashboard ฝั่ง Rider)

ปุ่มย้อนกลับ → `/admin`

### สถิติ
- ไรเดอร์ทั้งหมด (`user_roles.role='rider'`)
- ออนไลน์ตอนนี้ / รออนุมัติ / กำลังส่ง (`orders status in picked_up/delivering`)
- งานในคิว (`orders rider_id is null and status='ready'`)
- ส่งสำเร็จวันนี้

### ระบบจัดการ
- **ไรเดอร์รออนุมัติ** — `riders where is_approved=false` join profile → ปุ่ม "อนุมัติ" (update `is_approved=true`) / "ปฏิเสธ"
- **ไรเดอร์ออนไลน์** — list แสดง ชื่อ + เบอร์ + เวลา last update (ถ้ามี `current_lat/lng`)
- **ตารางไรเดอร์ทั้งหมด** — ค้นหา + filter (อนุมัติแล้ว / ออนไลน์ / รออนุมัติ) + ปุ่ม ยืนยันอีเมล / รีเซ็ตรหัสผ่าน / **ระงับสิทธิ์** (set `is_approved=false`)
- **งานที่กำลังส่ง** — `orders` ที่ `rider_id not null and status in picked_up/delivering` พร้อมชื่อไรเดอร์, ร้าน, ลูกค้า (read-only, ช่วยมอนิเตอร์)

---

## รายละเอียดทางเทคนิค

### ไฟล์ที่จะแก้/เพิ่ม
- `src/routes/_app/admin.tsx` — เปลี่ยนเป็น landing (เก็บ stat สรุป + 2 การ์ดทางเข้า + แอดมิน management เดิม)
- `src/routes/_app/admin.eat.tsx` — **ใหม่** dashboard ฝั่ง Eat
- `src/routes/_app/admin.rider.tsx` — **ใหม่** dashboard ฝั่ง Rider
- `src/lib/admin.functions.ts` — เพิ่ม server fn:
  - `approveRestaurant({ id })`, `rejectRestaurant({ id })`
  - `approveRider({ id })`, `suspendRider({ id })`
  - `listRestaurantsForAdmin()` — รวม flag pending
  - `listRidersForAdmin()` — join profile + email จาก auth
  - `listRecentOrders({ limit })`
  - ใช้ `requireSupabaseAuth` + เช็ค `has_role(userId,'admin')` ก่อนทำงานทุก fn

### Routing
- ใช้ flat naming `admin.eat.tsx` / `admin.rider.tsx` ตาม TanStack convention
- guard: เช็ค `role === "admin"` ในทุก component (เหมือนปัจจุบัน) ก่อน render

### ไม่ต้องทำ
- ไม่ต้อง migration (schema มีพอแล้ว)
- ไม่กระทบ `SHARED_CONTRACT.md` (ไม่แตะ schema/state/RLS)
- ไม่กระทบฝั่ง HappyRider

---

## คำถามก่อนเริ่ม

1. **"ปฏิเสธ" ร้าน/ไรเดอร์** = ลบจริงจาก DB หรือแค่ set flag (เก็บประวัติไว้)? ตอนนี้ schema ไม่มี `is_rejected` — ทางง่ายคือ **ลบ** ออก ผู้ใช้สมัครใหม่ได้
2. **"ระงับสิทธิ์ไรเดอร์"** = set `is_approved=false` (เลิกเห็นงาน) พอไหม หรืออยากเพิ่ม flag `is_banned` แยก (ต้อง migration)?
3. **ฝั่ง Eat ต้องมี "ระงับร้าน"** ด้วยไหม (set `is_approved=false` → ลูกค้ามองไม่เห็น)?
