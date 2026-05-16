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
