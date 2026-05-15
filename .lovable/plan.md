## เป้าหมาย
ย่อขนาดหน้าปกของการ์ดร้านในหน้าแรก (`/home`) ให้เป็นสี่เหลี่ยมผืนผ้าแบนเตี้ยลง เท่ากับหน้าปกในหน้าจัดการร้าน (`/my-restaurant`) เพื่อไม่ให้กินพื้นที่มากเกินไป

## การเปลี่ยนแปลง
ไฟล์: `src/routes/_app/home.tsx` (บรรทัด ~334)

- เปลี่ยน container ของหน้าปกจาก `aspect-[2/1]` → `h-40` (ความสูงเท่ากับ `my-restaurant.tsx` บรรทัด 215)
- คงคลาสอื่นไว้: `bg-gradient-to-br from-accent to-secondary relative`
- รูป `<img>` ยังคง `w-full h-full object-cover` ตามเดิม

## ขอบเขต
- แก้ไข UI อย่างเดียว ไม่แตะ logic, schema, หรือ business rules
- ไม่กระทบหน้าอื่นนอกจาก `/home`
