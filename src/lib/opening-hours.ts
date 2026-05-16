// Utility สำหรับเช็คว่าร้านเปิดอยู่จริงไหม ตามเวลาทำการ (โซนเวลา Asia/Bangkok)

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface DayHours {
  open: string; // "HH:mm"
  close: string; // "HH:mm"
  closed: boolean;
}

export type OpeningHours = Partial<Record<DayKey, DayHours>>;

// JS getDay(): 0=Sun..6=Sat
const DAY_MAP: Record<number, DayKey> = {
  0: "sun",
  1: "mon",
  2: "tue",
  3: "wed",
  4: "thu",
  5: "fri",
  6: "sat",
};

const DAY_LABEL_TH: Record<DayKey, string> = {
  mon: "จันทร์",
  tue: "อังคาร",
  wed: "พุธ",
  thu: "พฤหัสบดี",
  fri: "ศุกร์",
  sat: "เสาร์",
  sun: "อาทิตย์",
};

// คืนค่า { day, hour, minute } ตามเวลาท้องถิ่นของไทย ไม่ว่าผู้ใช้จะอยู่โซนไหน
function nowInBangkok(): { day: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const wk = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minStr = parts.find((p) => p.type === "minute")?.value ?? "0";
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minStr, 10);
  return { day: map[wk] ?? 0, minutes: hour * 60 + minute };
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

/**
 * เช็คว่าร้านเปิดตามเวลาทำการของไทยหรือไม่
 * - ถ้าไม่มี opening_hours → ถือว่าเปิด (เพื่อ backward compat)
 * - รองรับช่วงข้ามเที่ยงคืน เช่น 18:00 - 02:00
 */
export function isOpenNow(oh: OpeningHours | null | undefined): boolean {
  if (!oh) return true;
  const { day, minutes } = nowInBangkok();
  const todayKey = DAY_MAP[day];
  const today = oh[todayKey];

  if (today && !today.closed) {
    const o = toMinutes(today.open);
    const c = toMinutes(today.close);
    if (o !== null && c !== null) {
      if (c > o) {
        if (minutes >= o && minutes < c) return true;
      } else if (c < o) {
        // ข้ามเที่ยงคืน — เปิดถ้าหลัง open ของวันนี้
        if (minutes >= o) return true;
      }
    }
  }

  // เช็คเมื่อวานในกรณีข้ามเที่ยงคืน
  const yesterdayKey = DAY_MAP[(day + 6) % 7];
  const yesterday = oh[yesterdayKey];
  if (yesterday && !yesterday.closed) {
    const o = toMinutes(yesterday.open);
    const c = toMinutes(yesterday.close);
    if (o !== null && c !== null && c < o) {
      // ช่วงข้ามคืน — ยังเปิดอยู่ถ้าก่อนเวลาปิด
      if (minutes < c) return true;
    }
  }

  return false;
}

/**
 * หาเวลาเปิดถัดไป (สำหรับแสดงข้อความ "เปิด 09:00")
 */
export function nextOpenLabel(oh: OpeningHours | null | undefined): string | null {
  if (!oh) return null;
  const { day, minutes } = nowInBangkok();

  // วันนี้ — ถ้ายังไม่ถึงเวลาเปิด
  const todayKey = DAY_MAP[day];
  const today = oh[todayKey];
  if (today && !today.closed) {
    const o = toMinutes(today.open);
    if (o !== null && minutes < o) {
      return `เปิด ${today.open}`;
    }
  }

  // หาวันถัดไปใน 7 วัน
  for (let i = 1; i <= 7; i++) {
    const k = DAY_MAP[(day + i) % 7];
    const d = oh[k];
    if (d && !d.closed) {
      const label = i === 1 ? "พรุ่งนี้" : DAY_LABEL_TH[k];
      return `เปิด${i === 1 ? " " : "วัน"}${label} ${d.open}`;
    }
  }
  return null;
}

/**
 * หา Date ของเวลา "ปิดร้าน" ครั้งถัดไปจากเวลาปัจจุบัน (โซน Asia/Bangkok)
 * - ถ้าตอนนี้อยู่ในช่วงเปิด → คืน close ของช่วงนั้น
 * - ถ้าตอนนี้นอกเวลา → คืน close ของช่วงเปิดถัดไป
 * - คืน null ถ้าหา 7 วันแล้วยังไม่เจอ
 */
export function nextCloseAt(oh: OpeningHours | null | undefined): Date | null {
  if (!oh) return null;
  const { day, minutes } = nowInBangkok();

  // หาจากวันนี้ไป 8 วัน (เผื่อข้ามคืน)
  for (let i = 0; i <= 7; i++) {
    const dIdx = (day + i) % 7;
    const k = DAY_MAP[dIdx];
    const d = oh[k];
    if (!d || d.closed) continue;
    const o = toMinutes(d.open);
    const c = toMinutes(d.close);
    if (o === null || c === null) continue;

    // close ของวันนี้ — อาจอยู่วันถัดไปถ้าข้ามคืน
    const closeDayOffset = c <= o ? i + 1 : i;
    const closeMinutes = c;

    // ถ้าเป็นวันนี้ (i=0) ต้องเช็คว่ายังไม่เลย close
    if (i === 0) {
      const closeAbs = closeDayOffset * 1440 + closeMinutes;
      if (minutes >= closeAbs) continue; // close แล้ว ดูวันถัดไป
    }
    return bangkokDateFromOffset(closeDayOffset - i, closeMinutes, i);
  }
  return null;
}

// สร้าง Date object จาก (จำนวนวันนับจากวันนี้ตามเวลาไทย, นาทีของวัน)
function bangkokDateFromOffset(_dummy: number, closeMinutes: number, dayFromToday: number): Date {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const y = parseInt(parts.find((p) => p.type === "year")!.value, 10);
  const m = parseInt(parts.find((p) => p.type === "month")!.value, 10);
  const d = parseInt(parts.find((p) => p.type === "day")!.value, 10);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + dayFromToday);
  const yy = base.getUTCFullYear();
  const mo = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  const hh = String(Math.floor(closeMinutes / 60)).padStart(2, "0");
  const mm = String(closeMinutes % 60).padStart(2, "0");
  return new Date(`${yy}-${mo}-${dd}T${hh}:${mm}:00+07:00`);
}

/**
 * Format Date → label ภาษาไทย เช่น "พรุ่งนี้ 21:00" หรือ "วันพุธ 21:00"
 */
export function formatCloseLabel(d: Date): string {
  const nowBkk = nowInBangkok();
  const targetParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const wk = targetParts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hh = targetParts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = targetParts.find((p) => p.type === "minute")?.value ?? "00";
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const targetDay = dayMap[wk] ?? 0;
  const diff = (targetDay - nowBkk.day + 7) % 7;
  const dayLabel = diff === 0 ? "วันนี้" : diff === 1 ? "พรุ่งนี้" : `วัน${DAY_LABEL_TH[DAY_MAP[targetDay]]}`;
  return `${dayLabel} ${hh}:${mm}`;
}

