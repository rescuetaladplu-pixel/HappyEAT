## ปัญหา

หน้าแรก (รายการร้าน) และการบันทึกที่อยู่ค้าง เพราะ Supabase ตอบ 401:

```
permission denied for function has_role
```

## สาเหตุ

RLS policy ของตาราง `restaurants`, `addresses`, `profiles`, `user_roles` เรียกฟังก์ชัน `public.has_role(uuid, app_role)` แต่ฟังก์ชันนี้ให้สิทธิ์ EXECUTE เฉพาะ `authenticated` ไม่ได้ให้ `anon` ด้วย เมื่อหน้าแรกโหลดก่อน session พร้อม (หรือกรณีไม่ล็อกอิน) คำขอจะวิ่งด้วย role `anon` แล้ว Postgres ปฏิเสธ → query ค้าง → ปุ่มบันทึก/หน้าแรกหมุนตลอด

## แผนแก้ (1 migration)

GRANT EXECUTE บน `public.has_role(uuid, app_role)` ให้ `anon` (และยืนยันให้ `authenticated` ด้วย) เท่านี้ policy จะรันผ่านได้ทุก role

```sql
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO anon, authenticated;
```

ไม่แก้โค้ดฝั่ง frontend ใด ๆ
