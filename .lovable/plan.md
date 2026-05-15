## ปัญหาที่พบ
- บนมือถือหน้าแรกแสดง skeleton จาก SSR ก่อนที่ JavaScript จะทำงานครบ ทำให้ผู้ใช้รู้สึกว่าค้าง โดยเฉพาะในเว็บแอป/PWA
- มี runtime error ล่าสุด: `SyntaxError: Missing catch or finally clause (126:6)` ซึ่งอาจทำให้ hydration/JS หยุดในบาง session
- หน้าโปรไฟล์มีการเรียก `useEffect` หลัง `return` ตามเงื่อนไข `authLoading` ซึ่งผิดกฎ React Hooks และเสี่ยงทำให้สถานะล็อกอิน/หน้าโปรไฟล์เพี้ยนหลังเข้าออกหน้าในมือถือ
- Manifest ของ PWA ถูกเรียกแล้วได้ 401 ใน preview ซึ่งไม่ใช่ต้นเหตุหลักของข้อมูลร้าน แต่เป็นสัญญาณว่าเว็บแอปมือถืออาจมี cache/session behavior ต่างจากเบราว์เซอร์คอม

## แผนแก้
1. แก้ `src/routes/_app/profile.tsx`
   - ย้าย `useEffect` ทั้งหมดให้ถูกเรียกก่อน conditional return เสมอ
   - เพิ่ม timeout/error guard ให้การโหลดร้านของผู้ใช้ไม่ทำให้หน้าโปรไฟล์ค้าง
   - ถ้า auth ยังโหลดอยู่ ให้แสดง spinner โดยไม่ทำให้ hooks order เปลี่ยน

2. ปรับ `src/lib/auth.tsx`
   - ทำให้การเช็ก session และโหลด role มี timeout/fallback
   - ตั้ง `loading=false` เสมอ แม้ `getSession()` หรือการโหลด role ใช้เวลานาน/ล้มเหลว
   - เมื่อ login สำเร็จให้รอ session ถูกตั้งค่าให้ครบก่อนเปลี่ยนหน้า เพื่อลดอาการไปหน้าแรกแล้วเด้งกลับว่าไม่ได้ login

3. ปรับ `src/routes/auth.tsx`
   - ย้าย redirect หลัง login ออกจาก render phase ไปอยู่ใน `useEffect`
   - หลัง sign in ให้รอ auth state update สั้น ๆ ก่อน navigate ไป `/home`
   - ป้องกันปุ่ม login ค้างด้วย `try/finally`

4. ปรับ `src/routes/_app/home.tsx`
   - ตั้งค่า initial loading ให้เหมาะกับ client/mobile มากขึ้น เพื่อลด skeleton ค้างจาก SSR
   - เมื่อ query ร้านสำเร็จให้แสดงข้อมูลทันที และเมื่อ timeout ให้แสดงปุ่มลองใหม่แทนค้าง
   - address load/save จะไม่กระทบการโหลดหน้าแรก

5. ตรวจสอบหลังแก้
   - เปิด `/home` ด้วย viewport มือถือ 390x844
   - ตรวจว่า skeleton หายและการ์ดร้านแสดง
   - เข้า `/profile` แล้วไม่เด้งกลับหน้า login ระหว่าง auth loading
   - ตรวจ console/runtime error ว่าไม่มี error ที่ทำให้ JS หยุด

## ผลลัพธ์ที่คาดหวัง
- เว็บแอปบนมือถือไม่ค้างเป็น skeleton
- Login แล้วสถานะยังอยู่เมื่อกดหน้าแรก/หน้าฉัน
- หน้าโปรไฟล์ไม่แสดง “ให้ล็อกอินใหม่” ระหว่างระบบกำลังโหลด session
- ถ้าเน็ตช้าจริง ผู้ใช้จะเห็นข้อความและปุ่มลองใหม่แทนหน้าค้าง