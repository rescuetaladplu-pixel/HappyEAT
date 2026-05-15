
# แผนสร้างระบบจัดการร้านอาหารแบบครบวงจร

## ภาพรวม
ปรับหน้า "ฉัน" (Profile) ให้แสดงเมนูเข้าสู่ "ร้านอาหารของฉัน" สำหรับผู้ที่มี role = `restaurant` (และเพิ่มปุ่ม "สมัครเปิดร้าน" สำหรับ customer ที่ยังไม่มีร้าน) จากนั้นขยาย restaurant-dashboard เดิมให้รองรับฟังก์ชันครบทั้ง 12 ข้อ

แบ่งงานเป็น 3 เฟส เพื่อให้ตรวจงานได้ทีละส่วน

---

## เฟส 1 — โปรไฟล์ร้าน + แผนที่ + เวลาเปิด-ปิด

### 1.1 Database migration
เพิ่มฟิลด์ใน `restaurants`:
- `logo_url`, `cover_url` (text)
- `opening_hours` (jsonb) — โครงสร้าง `{ mon: {open:"08:00", close:"20:00", closed:false}, tue:..., ... }`

เพิ่มตาราง `menu_categories` (id, restaurant_id, name, sort_order)

Storage bucket: `restaurant-images` (public) สำหรับโลโก้/ปก/รูปเมนู พร้อม RLS ให้เจ้าของร้านอัปโหลดได้

### 1.2 หน้า "ร้านอาหารของฉัน" (`/_app/my-restaurant`)
แท็บย่อย:
- **โปรไฟล์ร้าน**: ชื่อ, โลโก้ (อัปโหลด), ภาพปก (อัปโหลด), เบอร์โทร, รายละเอียด, หมวดหมู่ร้าน
- **ที่อยู่ & แผนที่**: ใช้ `react-leaflet` + OpenStreetMap tiles (ฟรี ไม่ต้องคีย์) ปักหมุด lat/lng
- **เวลาเปิด-ปิด**: ตารางรายวัน 7 วัน + ปุ่ม Toggle "เปิด/ปิดร้านชั่วคราว" (ฟิลด์ `is_open` เดิม)

### 1.3 ปรับหน้า Profile
เพิ่มการ์ด "ร้านอาหารของฉัน" ถ้า role = restaurant → ลิงก์ไป `/my-restaurant`
ถ้า role = customer → ปุ่ม "เปิดร้านอาหารกับเรา" (เปลี่ยน role + redirect)

---

## เฟส 2 — เมนู, ตัวเลือกเสริม, สต็อก, ออเดอร์ Real-time

### 2.1 Database migration
- ตาราง `menu_addon_groups` (id, menu_item_id, name, is_required, max_select)
- ตาราง `menu_addon_options` (id, group_id, name, price)
- เพิ่มฟิลด์ `category_id` ใน `menu_items` (อ้าง `menu_categories`)
- เพิ่ม `image_url` (มีอยู่แล้ว) และ `is_available` (มีอยู่แล้ว = สถานะหมด/ไม่หมด)

### 2.2 หน้าจัดการเมนู (แท็บใน my-restaurant)
- จัดการหมวดหมู่ (เพิ่ม/ลบ/ลำดับ)
- เพิ่ม/แก้ไขเมนู: ชื่อ, รูป (upload), รายละเอียด, ราคา, หมวดหมู่
- จัดการ Add-ons ต่อเมนู: กลุ่ม + ตัวเลือก (เช่น "ระดับความเผ็ด" → น้อย/กลาง/เผ็ด)
- Toggle "หมดวันนี้" ต่อเมนู

### 2.3 แดชบอร์ดออเดอร์ Real-time
- Subscribe `orders` table (มีอยู่แล้ว) + เล่นเสียง beep ผ่าน Web Audio API เมื่อมีออเดอร์ใหม่
- แสดงรายการออเดอร์พร้อม items, ที่อยู่, หมายเหตุ, ราคารวม
- ปุ่มเปลี่ยนสถานะ: pending → accepted → preparing → ready (ส่งมอบไรเดอร์) → delivered

---

## เฟส 3 — Dashboard ยอดขาย, โปรโมชั่น, รีวิว

### 3.1 Database migration
- ตาราง `promotions` (id, restaurant_id, code, type: 'percent'|'amount', value, menu_item_id NULL = ทั้งร้าน, active, valid_from, valid_to)
- เพิ่มฟิลด์ `restaurant_reply` (text) ใน `reviews`

### 3.2 Dashboard ยอดขาย
- Server function รวมยอด orders ที่ status='delivered' ของร้าน
- กราฟรายวัน (7 วันล่าสุด) + รายเดือน + ยอดรวม + จำนวนออเดอร์ + AOV
- ใช้ recharts (มีในโปรเจกต์แล้ว)

### 3.3 จัดการโปรโมชั่น
- สร้าง/แก้ไข/ปิดโค้ดส่วนลด หรือส่วนลดรายเมนู
- (การใช้โค้ดในฝั่งลูกค้าเตรียมไว้ในเฟสถัดไป — เฟสนี้แค่ฝั่งเจ้าของร้าน)

### 3.4 รีวิวและคะแนน
- รายการรีวิวลูกค้า (จากตาราง `reviews`)
- ช่องตอบกลับ (`restaurant_reply`)
- คะแนนเฉลี่ย + กราฟ

---

## รายละเอียดทางเทคนิค

- Map: `bun add react-leaflet leaflet @types/leaflet` + import CSS leaflet
- Audio: `new AudioContext()` + oscillator beep (ไม่ต้องไฟล์)
- รูปภาพทั้งหมดใช้ Supabase Storage bucket `restaurant-images` (public read)
- ทุก mutation ผ่าน Supabase client ฝั่ง browser (RLS เดิมรองรับ owner_id แล้ว)
- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;` (ถ้ายังไม่ได้เพิ่ม)
- Route ใหม่: `src/routes/_app/my-restaurant.tsx` (แท็บภายในด้วย shadcn Tabs) — จะแทนที่/เสริม `restaurant-dashboard.tsx` เดิม

## ลำดับการ implement
1. Migration + storage bucket ของเฟส 1
2. หน้า my-restaurant (โปรไฟล์ + แผนที่ + เวลา) + ปรับ Profile
3. หยุดให้ผู้ใช้ตรวจ → ดำเนินเฟส 2 → ตรวจ → เฟส 3

เริ่มจากเฟส 1 ก่อนนะครับ
