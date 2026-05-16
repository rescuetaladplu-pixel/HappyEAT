
## สิ่งที่เจอจากการตรวจ DB

ตอนนี้ในระบบจริง:

| ผู้ใช้ | roles | อยู่ใน `riders` |
|---|---|---|
| ไกรสิท (rider ที่สมัครเข้ามา) | `rider`, `customer` | ✓ |
| Admin (`adminmai`) | `admin` | ✓ ← ตัวต้นเหตุที่ทำให้นับเป็น 2 |
| สตีฟ จ๊อบ | `customer` | - |
| Tester | `customer` | - |

**สรุปสาเหตุ 3 ข้อที่ user รายงาน:**

1. **ไรเดอร์ขึ้น 2** — เพราะแดชบอร์ดนับจากตาราง `riders` ตรงๆ แต่ในนั้นมีบัญชี admin หลุดเข้าไปอยู่ด้วย (น่าจะเกิดตอน admin ลองกดอะไรในฝั่งไรเดอร์)
2. **rider ได้ role `customer` แถมมาด้วย** — เพราะ DB trigger `handle_new_user` มี logic บังคับใส่ `customer` ให้ทุกคนที่สมัครเป็น rider/restaurant
3. **แดชบอร์ดยังรวมร่าง** — Card สถิติแสดง 3 ตัวเลขรวมกัน (orders/restaurants/riders) ไม่แยกฝั่ง Eat vs Rider

---

## สิ่งที่จะทำ

### 1. แยกแดชบอร์ดแอดมินเป็น 2 ส่วน (UI ใน `src/routes/_app/admin.tsx`)

```
[ ฝั่ง Eat 🍔 ]                    [ ฝั่ง Rider 🛵 ]
- ออเดอร์รวม                       - ไรเดอร์ทั้งหมด
- ร้านค้า                          - ไรเดอร์ออนไลน์ตอนนี้
- ลูกค้า (role=customer)           - ไรเดอร์รออนุมัติ (is_approved=false)
- ออเดอร์รออนุมัติร้าน             - ออเดอร์ที่ไรเดอร์ถืออยู่ (status in transit)
```

ตารางรายชื่อผู้ใช้ยังอยู่ครบเหมือนเดิม แต่เพิ่ม quick filter tab: "ทั้งหมด / ฝั่ง Eat / ฝั่ง Rider"

### 2. แก้ stat ไรเดอร์ให้ตรงกับ role จริง

เปลี่ยนจาก `SELECT count FROM riders` → นับเฉพาะคนที่ `user_roles.role = 'rider'` แทน เพื่อกันบัญชี admin/customer ที่เผลอมีแถวใน `riders` ติดมา

พร้อมกับ **ลบแถว admin ที่หลุดเข้า `riders`** ทิ้ง (migration cleanup)

### 3. ยกเลิก auto-add `customer` role ตอนสมัคร rider

แก้ trigger `handle_new_user` ให้:
- สมัคร role=`rider` → ใส่ `rider` อย่างเดียว
- สมัคร role=`restaurant` → ใส่ `restaurant` อย่างเดียว (ตามหลักการ "แยกแอคเค้าท์ชัดเจน" เดียวกัน)
- สมัครปกติ → `customer`

และลบ role `customer` ที่ติดมากับไกรสิทออก (cleanup ครั้งเดียว)

### 4. เรื่อง "อีเมลเดียวกันสมัครได้ทั้งฝั่ง Eat และ Rider"

**ตรงนี้ต้องตัดสินใจก่อนทำ** — Supabase auth บังคับ unique email ใน `auth.users` เปลี่ยนไม่ได้ ทำให้สมัครซ้ำด้วยอีเมลเดียวไม่ได้โดยตรง ทางออกที่เป็นไปได้:

- **A. Email alias ภายใน** — ฝั่ง rider เก็บ auth email เป็น `user+rider@domain.com` (Gmail/most providers รองรับ + alias) แต่แสดง/ส่งจริงเป็น `user@domain.com` ปกติ → ผู้ใช้รู้สึกว่าใช้อีเมลเดียวกันได้ ส่วนระบบยังแยกบัญชีจริง
- **B. ห้ามซ้ำ** — บอกผู้ใช้ตรงๆ ว่าต้องใช้คนละอีเมล (ง่ายสุด ไม่ต้องเขียน logic เพิ่ม)
- **C. รวมเป็นบัญชีเดียวแบบมี role หลายอัน** — ตรงข้ามกับที่ user ขอ ตัดทิ้ง

แผนนี้จะ **ขอเลือกข้อ A หรือ B ก่อน** แล้วค่อยลงรายละเอียดเฟส implementation (ส่วนใหญ่อยู่ฝั่ง HappyRider room ไม่ใช่ห้องนี้ — ห้องนี้แค่ปรับ trigger รองรับ)

---

## รายละเอียดทางเทคนิค

### Migration (รันใน room นี้ — เจ้าของ schema)

```sql
-- 4a. แก้ trigger ไม่ใส่ customer role ให้ rider/restaurant
CREATE OR REPLACE FUNCTION public.handle_new_user() ...
  -- ตัด block IF _role IN ('restaurant','rider') THEN INSERT customer ... ทิ้ง

-- 4b. ลบข้อมูลเก่าที่หลุด
DELETE FROM public.user_roles
  WHERE user_id='316d9fdb-...' AND role='customer';  -- ไกรสิท
DELETE FROM public.riders
  WHERE id='5038d4c3-...';  -- admin หลุดเข้า riders

-- (ไม่แตะ admin ที่ยังเป็นแอดมิน)
```

### Frontend (`src/routes/_app/admin.tsx`)
- เปลี่ยน Stat row → 2 Section (Eat / Rider) แต่ละ section มี Card stat 3-4 ตัว
- queries ใหม่ผ่าน `supabase.from(...).select('id',{count:'exact',head:true})` พร้อม filter:
  - eat customers: `user_roles` where `role='customer'`
  - eat pending orders: `orders` where `status='pending'`
  - rider total: `user_roles` where `role='rider'`
  - rider online: `riders` where `is_online=true`
  - rider pending approval: `riders` where `is_approved=false`
  - rider active deliveries: `orders` where `status in (rider_picked_up/...) and rider_id is not null`

### Shared contract impact
- เปลี่ยน trigger `handle_new_user` = กระทบ HappyRider room ด้วย → ต้อง append changelog ใน `docs/SHARED_CONTRACT.md`
- ฝั่ง HappyRider จะรับผลทันที (signup ไม่มี customer แถม) — ต้องแจ้งห้องนั้นด้วย

---

## คำถามก่อนเริ่ม implement

**เลือกทางจัดการอีเมลซ้ำ Eat ↔ Rider:**
- **A** ใช้ email-alias trick (`+rider` suffix ภายใน, ผู้ใช้ยังเห็นอีเมลตัวเอง) — ทำได้ตามที่ขอเป๊ะ แต่ logic เพิ่มฝั่ง HappyRider signup
- **B** บังคับใช้คนละอีเมล — เรียบง่าย แต่ user ต้องมี 2 อีเมลจริง

ส่วนข้อ 1-3 ทำได้เลยไม่ต้องตัดสินใจเพิ่ม
