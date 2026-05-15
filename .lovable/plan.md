## เป้าหมาย
ในหน้าแรก (Sheet "ที่อยู่จัดส่ง") ให้ช่อง "ที่อยู่" เปลี่ยนเป็น **กล่องค้นหาแบบ autocomplete** — พิมพ์ "โรงแรมฮิลตันพัทยา" แล้วมีรายการสถานที่ขึ้นมาให้เลือก พอกดสถานที่ระบบจะกรอกที่อยู่เต็มและปักหมุด (lat/lng) บนแผนที่ให้อัตโนมัติ

## วิธีทำ

ใช้ **Google Places Autocomplete (New)** ผ่าน Lovable connector — เป็นบริการที่ครอบคลุมสถานที่ในไทย (โรงแรม ห้าง ชื่อหมู่บ้าน ฯลฯ) ดีที่สุด

### 1. เปิด Google Maps connector
ก่อนเริ่ม ต้องเชื่อม Google Maps connector ในโปรเจกต์ก่อน — ผมจะเปิด dialog ให้กดเชื่อมตอนเริ่ม implement

### 2. คอมโพเนนต์ใหม่ `src/components/PlaceAutocomplete.tsx`
- Input ที่ debounce การพิมพ์ (~300ms)
- เรียก `places/v1/places:autocomplete` ผ่าน connector gateway (กรองเฉพาะประเทศไทย ภาษาไทย)
- แสดงผลลัพธ์เป็นรายการ dropdown ใต้ช่อง input (ชื่อสถานที่ + ที่อยู่ย่อ)
- เมื่อผู้ใช้กดเลือก → เรียก `places/v1/places/{placeId}` ดึงรายละเอียด (formattedAddress, location lat/lng)
- ส่งกลับผ่าน prop `onSelect({ address, lat, lng })`

### 3. แก้ `src/routes/_app/home.tsx`
- แทนที่ `<Textarea id="addr-text">` ด้วย `<PlaceAutocomplete>`
- ยังเก็บ Textarea เล็กไว้ด้านล่าง (ผู้ใช้สามารถแก้ที่อยู่หลังเลือกได้ เผื่อต้องเพิ่มเลขห้อง/บ้าน)
- เมื่อ `onSelect` → setAddrText, setLat, setLng พร้อมกัน → แผนที่ Leaflet จะ recenter อัตโนมัติ (มี `<Recenter>` อยู่แล้ว)

### 4. ทำเหมือนกันใน `my-restaurant_.settings.tsx` (Tab "ที่อยู่")
ร้านค้าก็จะตั้งที่อยู่ด้วย autocomplete เหมือนกัน — โค้ด component ใช้ซ้ำได้

## รายละเอียดเทคนิค
- ใช้ Places API (New) ไม่ใช่ legacy
- เรียกผ่าน `https://connector-gateway.lovable.dev/google_maps/places/v1/...` พร้อม Authorization + X-Connection-Api-Key header
- `LOVABLE_API_KEY` มีอยู่แล้วฝั่ง client (เป็น public key ของ gateway), `GOOGLE_MAPS_API_KEY` ก็เป็น connector secret
- request body: `{ input, languageCode: "th", regionCode: "TH", includedRegionCodes: ["th"] }`
- field mask `places.id,places.displayName,places.formattedAddress,places.location` เพื่อให้ราคาถูก
- ไม่แตะ database schema, ไม่แตะ auth
