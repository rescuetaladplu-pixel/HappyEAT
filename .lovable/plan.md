## เป้าหมาย

ทำหน้า **ฉัน > ร้านค้าของฉัน** (`/my-restaurant`) ให้เป็น "หน้าหลักของเจ้าของร้าน" — แสดงข้อมูลสรุปร้านด้านบน + เมนูทางลัดเข้าแต่ละเรื่องด้านล่าง แทนที่จะเป็นหน้าแก้ไขข้อมูลแบบ Tabs เหมือนปัจจุบัน

## โครงสร้างหน้าใหม่ (`/my-restaurant`)

**1. การ์ดสรุปร้าน (Overview)**
- ภาพหน้าปก (`cover_url`) เป็น banner ด้านบน
- รูปโปรไฟล์วงกลม (`logo_url`) ทับมุมล่างซ้ายของ cover
- ชื่อร้าน + หมวดหมู่ + badge สถานะ (อนุมัติแล้ว / รออนุมัติ)
- คำอธิบายร้าน (description)
- ที่อยู่ + เบอร์โทร
- เวลาเปิด-ปิดวันนี้ (อ่านจาก `opening_hours` ตามวันปัจจุบัน เช่น "วันนี้ 09:00 - 21:00" หรือ "ปิดวันนี้")
- Switch เปิด/ปิดร้าน (toggle `is_open`) อยู่มุมขวาบน
- ค่าจัดส่งเริ่มต้น + คะแนนรีวิว

**2. เมนูทางลัด (Grid 2 คอลัมน์)**

แต่ละเมนูเป็นการ์ดมีไอคอน + ชื่อ + คำอธิบายสั้น:

| เมนู | ลิงก์ | ไอคอน |
|---|---|---|
| จัดการข้อมูลร้านค้า | `/my-restaurant/settings` (ใหม่) | Store |
| จัดการเมนูอาหาร | `/restaurant/menu` | ChefHat |
| ออเดอร์คำสั่งซื้อ | `/restaurant/orders` | Bell |
| ข้อมูลยอดขาย | `/restaurant/analytics` | TrendingUp |
| โปรโมชั่น | `/restaurant/promotions` | Tag |
| รีวิวลูกค้า | `/restaurant/reviews` | MessageSquare |

## ย้ายฟอร์มแก้ไขข้อมูลร้านออกไปเป็นหน้าใหม่

สร้าง `src/routes/_app/my-restaurant.settings.tsx` รับฟอร์มเดิมที่อยู่ใน `/my-restaurant` (Tabs: โปรไฟล์ / ที่อยู่ / เวลาทำการ) — โค้ดยกมาทั้งหมดจากไฟล์ปัจจุบัน

## ไฟล์ที่ต้องเปลี่ยน

- `src/routes/_app/my-restaurant.tsx` — เขียนใหม่ให้เป็น hub (overview + menu grid). ลบ Tabs และฟอร์มแก้ไขออก แต่คงโค้ดส่วน "สร้างร้านครั้งแรก" ไว้เมื่อยังไม่มีร้าน
- `src/routes/_app/my-restaurant.settings.tsx` (ใหม่) — ย้าย Tabs โปรไฟล์/ที่อยู่/เวลา มาไว้ที่นี่ พร้อมปุ่ม "← กลับ" ไป `/my-restaurant`
- `src/routes/_app.tsx` — เปลี่ยน bottom nav ของ role `restaurant` จาก `/restaurant-dashboard` เป็น `/my-restaurant` เพื่อให้ tab "ร้านของฉัน" เข้าหน้า hub ใหม่ตรงกัน
- `src/routes/_app/restaurant-dashboard.tsx` — คงไว้ใช้งานได้ แต่จะไม่ใช่ทางเข้าหลัก (ผู้ใช้สามารถเข้าได้ผ่าน URL ตรง) หรือทำเป็น redirect ไป `/my-restaurant` ก็ได้ (เลือกทำ redirect เพื่อความสะอาด)

## หมายเหตุการออกแบบ

- ใช้ design tokens จาก `src/styles.css` (bg-card, text-muted-foreground, border-border) — ไม่ hardcode สี
- Layout `max-w-2xl mx-auto` เหมือนหน้าอื่น
- การ์ดเมนูใช้ shadcn `Card` + ไอคอน lucide ขนาด h-6, hover:bg-accent
- Overview card cover ใช้ aspect-[16/9] หรือ h-40, logo h-20 w-20 rounded-full border-4 border-card -mt-10

## สิ่งที่ไม่แตะ

- Schema database / RLS — ไม่ต้องเปลี่ยน
- Logic ของ /restaurant/menu, /restaurant/orders, /restaurant/analytics ฯลฯ — ไม่แตะ
- หน้า home/cart/customer-facing — ไม่เกี่ยว
