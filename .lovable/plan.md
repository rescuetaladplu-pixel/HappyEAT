## สรุปการเปลี่ยนแปลง

1. ย้าย UI "ตัวเลือกเสริม" เข้าไปอยู่ในหน้าต่างแก้ไขเมนู (ItemEditDialog) ต่อท้ายส่วน "ขนาด/ประเภท"
2. ลบปุ่ม "ตัวเลือกเสริม" และ AddonsDialog ออก เหลือปุ่มแก้ไขเมนูเดียว
3. เพิ่มระบบ "เทมเพลตกลุ่มตัวเลือกเสริม" ต่อร้าน — กลุ่มที่เคยสร้างจะถูกบันทึกอัตโนมัติ และสามารถเลือกใช้ซ้ำในเมนูอื่นได้

---

## 1. Database migration

เพิ่ม 2 ตารางใหม่สำหรับเก็บเทมเพลตกลุ่มตัวเลือกเสริมระดับร้าน:

- **`addon_group_templates`**: `id`, `restaurant_id`, `name` (unique ต่อร้าน), `is_required`, `min_select`, `max_select`, `created_at`
- **`addon_group_template_options`**: `id`, `template_id` (FK cascade), `name`, `price_delta`, `sort_order`

RLS: เจ้าของร้านอ่าน/เขียนเทมเพลตของร้านตัวเองได้ (ผ่าน `restaurants.owner_id = auth.uid()`)

---

## 2. `restaurant.menu.tsx` — รวม UI ตัวเลือกเสริมเข้า ItemEditDialog

**ลบ:**
- state `addonsForItem`, การเรียก `AddonsDialog`, ปุ่ม "ตัวเลือกเสริม" ใน `ItemList`, prop `onAddons`
- ฟังก์ชัน `AddonsDialog` ทั้งหมด

**เพิ่มใน `ItemEditDialog`** (หลังบล็อก variants, ก่อน "พร้อมขายวันนี้"):
- กล่อง "ตัวเลือกเสริม (ท็อปปิ้ง / ของเพิ่ม)" พร้อม TIP popover อธิบายว่า "บวกเพิ่มจากราคาฐาน"
- จัดการ state แบบ local เหมือน variants:
  ```
  type AddonOptionRow = { id?: string; name: string; price: string; tempKey: string }
  type AddonGroupRow = {
    id?: string;       // existing menu_addon_groups.id ถ้ามี
    name: string;
    isRequired: boolean;
    minSelect: number;
    maxSelect: number;
    options: AddonOptionRow[];
    tempKey: string;
  }
  ```
- โหลดกลุ่มที่มีอยู่ของเมนูนี้ (`pricing_mode != 'variant'`) + options
- ปุ่มต่อกลุ่ม: เพิ่มตัวเลือก / ลบตัวเลือก, สลับบังคับ, ตั้ง min/max, ลบกลุ่ม
- ปุ่มล่างกล่อง:
  - **"+ เพิ่มกลุ่มใหม่"** (ใส่ชื่อแล้วเพิ่ม)
  - **Select "เลือกจากกลุ่มที่เคยตั้งไว้"** — แสดงเทมเพลตของร้าน (ดึงจาก `addon_group_templates` + options) เลือกแล้วเพิ่มเป็นกลุ่มใหม่ใน state ทันที (id ใหม่, copy ค่าทั้งหมด)

**Save flow ใหม่ใน `save()`:**
หลัง insert/update menu_item และเรียก `syncVariants(savedId)` แล้ว เพิ่ม `syncAddons(savedId)`:
- โหลด ids กลุ่มเดิมของเมนู (ที่ไม่ใช่ variant) → ลบกลุ่มที่ไม่อยู่ใน state แล้ว (cascade options)
- สำหรับแต่ละกลุ่มใน state:
  - ถ้ามี `id` → update; ถ้าไม่มี → insert (ได้ id ใหม่)
  - sync options ของกลุ่มนั้น (ลบที่หายไป, update/insert ที่เหลือ)
  - **upsert template:** หลังบันทึกกลุ่มสำเร็จ ทำ upsert เข้า `addon_group_templates` (key = `restaurant_id + name`) และ replace options ของเทมเพลตนั้นด้วยค่าปัจจุบัน เพื่อให้เมนูถัดไปดึงไปใช้ได้

---

## 3. ไฟล์ที่ต้องแก้

- `supabase/migrations/...sql` — สร้าง 2 ตาราง + RLS
- `src/routes/_app/restaurant.menu.tsx` — ย้าย UI + ลบ AddonsDialog + เพิ่ม syncAddons + dropdown เทมเพลต
- ไม่ต้องแก้ฝั่งลูกค้า (`restaurants.$restaurantId.tsx`) เพราะ data shape ของ `menu_addon_groups/options` เหมือนเดิม

---

## รายละเอียดเชิงเทคนิค (สำหรับ devs)

- เทมเพลตเก็บแยกออกจาก `menu_addon_groups` เพื่อไม่กระทบโครงข้อมูลปัจจุบัน และ upsert โดยใช้ unique constraint `(restaurant_id, name)` — ถ้ากลุ่มชื่อเดิมถูกแก้ใน menu ใดก็ตาม เทมเพลตจะอัปเดตตาม
- เมื่อเลือกเทมเพลตมาใช้ในเมนูอื่น จะ deep copy ลง state เท่านั้น (แก้แล้วไม่กระทบเทมเพลตจนกว่าจะกดบันทึก)
- variant group (`pricing_mode='variant'`) ยังคงจัดการแยกในส่วน "ขนาด/ประเภท" เหมือนเดิม ไม่ขึ้นมาในส่วนตัวเลือกเสริม