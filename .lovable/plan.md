## เพิ่มสวิตช์เปิด/ปิดร้านบนการ์ด "ร้านค้าของฉัน" ในหน้าโปรไฟล์

ปรับการ์ด "ร้านค้าของฉัน" ในหน้า `/profile` ให้มีสวิตช์เปิด-ปิดร้านในตัว เพื่อให้เจ้าของร้านสลับสถานะออนไลน์ได้ทันทีโดยไม่ต้องเข้าไปหน้า `/my-restaurant`

### สิ่งที่จะเปลี่ยน

ไฟล์เดียว: `src/routes/_app/profile.tsx`

1. ตอนโหลดข้อมูลร้าน เปลี่ยนจาก `select("id")` เป็นดึง `id, is_open` มาเก็บใน state (`restaurant`) แทน boolean `hasRestaurant`
2. เพิ่มฟังก์ชัน `toggleOpen(open)` เรียก `supabase.from("restaurants").update({ is_open }).eq("id", restaurant.id)` พร้อม optimistic update และ toast แจ้งผล
3. ปรับเลย์เอาต์การ์ด "ร้านค้าของฉัน":
   - ส่วนซ้าย/บน: ไอคอน + ชื่อ "ร้านค้าของฉัน" + คำอธิบายเดิม (ยังเป็นลิงก์ไป `/my-restaurant`)
   - ส่วนล่าง (แยกด้วยเส้น `border-t`): แถบสถานะร้าน
     - จุดกลม `h-2 w-2 rounded-full` สีเขียว (`bg-green-500`) เมื่อเปิด / สีเทา (`bg-muted-foreground`) เมื่อปิด พร้อม ping animation ตอนออนไลน์
     - ข้อความ "สถานะร้าน: ออนไลน์ – พร้อมรับออเดอร์" หรือ "สถานะร้าน: ออฟไลน์ – ปิดรับออเดอร์"
     - `Switch` ทางขวา ผูกกับ `restaurant.is_open` → `toggleOpen`
   - ใช้ `e.stopPropagation()` + `e.preventDefault()` บนตัว Switch container เพื่อไม่ให้คลิกสวิตช์แล้วเด้งไป `/my-restaurant`

### หมายเหตุ

- เงื่อนไขการแสดงการ์ดยังคงเดิม (`role === "restaurant" || role === "admin" || hasRestaurant`)
- ไม่แตะไฟล์อื่น ไม่แตะ schema ไม่แตะ RLS — ใช้ policy update เดิมของ `restaurants` (เจ้าของแก้ของตัวเองได้)
- ใช้ semantic tokens จาก design system; สีเขียวสถานะออนไลน์ใช้ `bg-green-500` (มาตรฐานสำหรับ status indicator) แต่ข้อความและพื้นหลังอื่นใช้ token ปกติ
