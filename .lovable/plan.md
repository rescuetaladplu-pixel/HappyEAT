## เฟส 1 เสร็จแล้ว

- Migration: เพิ่ม `category_id` + `sort_order` ใน `menu_items`, สร้าง `menu_addon_groups` + `menu_addon_options` พร้อม RLS
- หน้าใหม่ `/restaurant/menu` — จัดการหมวดหมู่ + เพิ่ม/แก้ไขเมนู (รูป, รายละเอียด, ราคา, หมวด) + สวิตช์ "หมดวันนี้" + จัดการ add-on groups/options
- ปรับ `restaurant-dashboard` ให้มีลิงก์ไปหน้า "จัดการเมนูเต็มรูปแบบ"
- ฝั่งลูกค้า: `restaurants.$restaurantId.tsx` แสดงเมนูจัดกลุ่มตามหมวด + dialog เลือก add-ons + จำนวน + โน้ต
- Cart รองรับ add-ons (lineId แยกต่อ combo, เก็บใน `order_items.notes`)

## เฟสถัดไป (รอผู้ใช้สั่ง)
- เฟส 2: แดชบอร์ดออเดอร์ Real-time + เปลี่ยนสถานะครบวงจร + เสียงแจ้งเตือน
- เฟส 3: สรุปยอดขาย + โปรโมชั่น/คูปอง
- เฟส 4: รีวิวและตอบกลับ
