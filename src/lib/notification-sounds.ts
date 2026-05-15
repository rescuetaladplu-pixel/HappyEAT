// Royalty-free notification sounds generated via Web Audio API
// No external audio files required, no licensing concerns.

export type SoundId = "ding" | "doorbell" | "chime" | "alert";

export const SOUND_OPTIONS: { id: SoundId; label: string; description: string }[] = [
  { id: "ding", label: "Ding คลาสสิก", description: "เสียงติ๊งใสๆ สั้นๆ" },
  { id: "doorbell", label: "Doorbell คู่", description: "ดิง-ดอง เหมือนกระดิ่งหน้าร้าน" },
  { id: "chime", label: "Chime สามจังหวะ", description: "สามโน้ตไล่ขึ้น โด-มี-ซอล" },
  { id: "alert", label: "Alert เร่งด่วน", description: "บี๊บซ้ำ 3 ครั้ง ดังสะดุดหู" },
];

type Ctx = AudioContext;

function getCtx(): Ctx | null {
  try {
    const W = window as unknown as {
      AudioContext: typeof AudioContext;
      webkitAudioContext: typeof AudioContext;
    };
    const C = W.AudioContext || W.webkitAudioContext;
    return new C();
  } catch {
    return null;
  }
}

function tone(
  ctx: Ctx,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = "sine",
  peak = 0.35,
) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g);
  g.connect(ctx.destination);
  o.type = type;
  o.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  o.start(t0);
  o.stop(t0 + duration + 0.05);
}

export function playNotificationSound(id: SoundId) {
  const ctx = getCtx();
  if (!ctx) return;
  let totalMs = 700;
  try {
    switch (id) {
      case "ding":
        tone(ctx, 880, 0, 0.5, "sine", 0.35);
        totalMs = 700;
        break;
      case "doorbell":
        // Ding (E5) then Dong (C5)
        tone(ctx, 659.25, 0, 0.45, "sine", 0.35);
        tone(ctx, 523.25, 0.35, 0.7, "sine", 0.35);
        totalMs = 1200;
        break;
      case "chime":
        // C5 - E5 - G5 ascending
        tone(ctx, 523.25, 0, 0.3, "triangle", 0.3);
        tone(ctx, 659.25, 0.18, 0.3, "triangle", 0.3);
        tone(ctx, 783.99, 0.36, 0.55, "triangle", 0.35);
        totalMs = 1100;
        break;
      case "alert":
        // 3 quick high beeps
        tone(ctx, 1000, 0, 0.18, "square", 0.28);
        tone(ctx, 1000, 0.25, 0.18, "square", 0.28);
        tone(ctx, 1000, 0.5, 0.22, "square", 0.3);
        totalMs = 900;
        break;
    }
  } catch {
    /* noop */
  }
  setTimeout(() => ctx.close().catch(() => {}), totalMs + 200);
}
