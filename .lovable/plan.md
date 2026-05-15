## ปรับการ์ดร้านอีก 2 จุด

ไฟล์: `src/routes/_app/my-restaurant.tsx`

### 1. โลโก้ยังโดนตัด (หลบใต้หน้าปก)
สาเหตุ: `Card` ตัวนอกใช้ `overflow-hidden` → โลโก้ที่ลอยขึ้นด้วย `-mt-10` ถูก crop ทิ้ง เห็นแค่ครึ่งล่าง

แก้:
- เอา `overflow-hidden` ออกจาก `Card` ตัวนอก แล้วย้ายไปครอบเฉพาะ `<div>` ของ cover image (เพื่อให้ภาพหน้าปกยังถูก clip ตามมุมโค้งของ Card อยู่)
- เพิ่มระยะลอยของโลโก้เป็น `-mt-12` และเพิ่ม shadow เล็กน้อยให้เด่นขึ้น

โครง:
```text
<Card class="p-0">                    ← ไม่มี overflow-hidden
  <div class="overflow-hidden rounded-t-xl">
    <cover image />
  </div>
  <div class="px-4 pb-4">
    <logo -mt-12 shadow />            ← ลอยขึ้นโผล่พ้นขอบ cover ได้
    ...
  </div>
</Card>
```

### 2. ป้ายหมวดหมู่ร้าน
ตอนนี้แสดงแค่ "ชานม" ลอย ๆ ใต้ชื่อร้าน ดูไม่รู้ว่าคืออะไร

แก้: เปลี่ยนเป็นแบดจ์/ข้อความที่บอกบริบทชัดเจน
- รูปแบบ: ไอคอน `Utensils` (จาก lucide) + ข้อความ `ประเภทร้าน: ชานม`
- สไตล์: ใช้ `text-muted-foreground` ขนาด `text-xs` พร้อมไอคอนเล็ก ๆ ด้านหน้า
- กรณีไม่มี category → ไม่แสดงบรรทัดนี้ (เหมือนเดิม)

## ขอบเขต
- แก้ไฟล์เดียว `src/routes/_app/my-restaurant.tsx`
- ไม่แตะ schema / business logic / RLS
- ไม่กระทบส่วนอื่นของหน้า