## เพิ่มระบบเทมเพลต "ประเภท/ขนาด" (Variants)

ต่อยอดจากระบบเทมเพลตกลุ่มตัวเลือกเสริมที่มีอยู่ ให้ส่วน "ประเภท/ขนาด" บันทึกเป็นเทมเพลตระดับร้านได้เช่นกัน เพื่อให้ร้านที่ทุกเมนูใช้ขนาดเดียวกัน (เช่น ชานม: เล็ก/กลาง/ใหญ่) ตั้งค่าเมนูใหม่ได้รวดเร็ว

---

## 1. Database migration

เพิ่ม 2 ตารางใหม่ขนาน addon templates:

- **`variant_group_templates`**: `id`, `restaurant_id`, `name` (unique ต่อร้าน เช่น "ขนาด"), `created_at`
- **`variant_group_template_options`**: `id`, `template_id` (FK cascade), `name` (เช่น "เล็ก"), `price_delta`, `sort_order`

RLS: เจ้าของร้านอ่าน/เขียนได้ผ่าน `restaurants.owner_id = auth.uid()` (เหมือน addon templates)

หมายเหตุ: variant ในตารางจริง (`menu_addon_groups` ที่ `pricing_mode='variant'`) เก็บ "ราคารวม" ของขนาดนั้น แต่เทมเพลตจะเก็บเป็น `price_delta` (ส่วนต่างจากตัวเลือกราคาต่ำสุด) เพราะแต่ละเมนูมีราคาฐานต่างกัน เวลาดึงเทมเพลตมาใช้กับเมนูใหม่จะ + ราคาฐานเมนูนั้นให้อัตโนมัติ

---

## 2. `restaurant.menu.tsx` — UI ใน ItemEditDialog

ในกล่อง "ขนาด/ประเภท" (เพิ่มข้างๆ ปุ่ม "เพิ่มตัวเลือก"):

- **Select "เลือกจากเทมเพลตที่เคยตั้งไว้"** — แสดงรายชื่อ `variant_group_templates` ของร้าน เลือกแล้ว:
  - เติม options ทั้งหมดลง state ของ variants (ราคา = ราคาฐานเมนูปัจจุบัน + price_delta ของแต่ละ option)
  - เปิด toggle "มีหลายขนาด/ประเภท" อัตโนมัติ

โหลดเทมเพลต variant พร้อม addon templates ใน `useEffect` เดิม

---

## 3. Save flow — `syncVariants()`

หลังบันทึก variants สำเร็จ เพิ่ม upsert template:

- คำนวณ `min(price)` ของ options ที่กรอก = ราคาฐาน
- upsert `variant_group_templates` (key = `restaurant_id + name`) — ใช้ชื่อกลุ่มจากช่อง "ชื่อกลุ่ม" (default "ขนาด")
- replace `variant_group_template_options` ของเทมเพลตนั้นด้วย options ปัจจุบัน โดย `price_delta = price - min(price)`

ผลลัพธ์: บันทึกเมนูแรกที่มี เล็ก/กลาง/ใหญ่ → เทมเพลตถูกสร้าง/อัปเดต → เมนูถัดไปกด "เลือกจากเทมเพลต" ได้ทันที

---

## 4. ไฟล์ที่แก้

- `supabase/migrations/...sql` — สร้าง 2 ตาราง + RLS
- `src/routes/_app/restaurant.menu.tsx` — เพิ่ม dropdown เทมเพลต variant + ขยาย `syncVariants` ให้ upsert template
- ไม่แตะฝั่งลูกค้า

---

## รายละเอียดเชิงเทคนิค

- เก็บแยก `variant_*` กับ `addon_*` เพราะ semantic ต่างกัน (variant = ราคาแทนที่, addon = บวกเพิ่ม) แม้โครงตารางคล้ายกัน
- เก็บเป็น `price_delta` ในเทมเพลต ทำให้นำไปใช้กับเมนูราคาฐานต่างกันได้ (เช่น ชาเขียวเล็ก 35 / ชานมเล็ก 40 ใช้เทมเพลต "ขนาด" เดียวกันได้)
- การเลือกเทมเพลตเป็น deep copy ลง state — แก้ราคาในเมนูนั้นแล้วไม่กระทบเทมเพลตจนกว่าจะกดบันทึก (ซึ่งจะ upsert เทมเพลตใหม่ด้วยค่าล่าสุด)
