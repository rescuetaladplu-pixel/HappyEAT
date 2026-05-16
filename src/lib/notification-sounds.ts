// Royalty-free notification sounds generated via Web Audio API.
// Designed to be LOUD and attention-grabbing for busy restaurant kitchens.
// Uses a DynamicsCompressor + master gain to push perceived loudness
// well above what a single oscillator can do, without harsh clipping.

export type SoundId =
  | "ding"
  | "doorbell"
  | "chime"
  | "alert"
  | "siren"
  | "buzzer"
  | "kitchen";

export const SOUND_OPTIONS: { id: SoundId; label: string; description: string }[] = [
  { id: "kitchen", label: "Kitchen Bell (แนะนำ)", description: "กระดิ่งร้านอาหารดังก้อง สะดุดหูสุด" },
  { id: "siren", label: "Siren เตือนภัย", description: "ไซเรนสองโทน ดังมาก เหมาะกับร้านที่เสียงดัง" },
  { id: "buzzer", label: "Buzzer ออด", description: "ออดยาวความถี่ต่ำ ทะลุหู" },
  { id: "alert", label: "Alert บี๊บซ้ำ", description: "บี๊บแหลม 4 ครั้งติด" },
  { id: "doorbell", label: "Doorbell คู่", description: "ดิง-ดอง คลาสสิก" },
  { id: "chime", label: "Chime สามจังหวะ", description: "โด-มี-ซอล นุ่มหู" },
  { id: "ding", label: "Ding คลาสสิก", description: "ติ๊งใสๆ สั้นๆ" },
];

// Volume profile. Browsers cap absolute output, but layering oscillators
// through a compressor + master gain >1 makes the result noticeably louder
// than a plain sine wave at gain 1.
export type VolumeLevel = "normal" | "loud" | "max";

export const VOLUME_OPTIONS: { id: VolumeLevel; label: string; mult: number }[] = [
  { id: "normal", label: "ปกติ", mult: 1 },
  { id: "loud", label: "ดัง (x2)", mult: 2 },
  { id: "max", label: "ดังสุด (x3)", mult: 3 },
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

interface Bus {
  ctx: Ctx;
  out: AudioNode; // attach oscillators here instead of ctx.destination
}

function makeBus(ctx: Ctx, volumeMult: number): Bus {
  // Compressor tames peaks so we can push the master gain higher
  // without nasty clipping.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;

  const master = ctx.createGain();
  master.gain.value = volumeMult; // 1x / 2x / 3x

  comp.connect(master).connect(ctx.destination);
  return { ctx, out: comp };
}

function tone(
  bus: Bus,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = "sine",
  peak = 0.6,
) {
  const { ctx, out } = bus;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g);
  g.connect(out);
  o.type = type;
  o.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  o.start(t0);
  o.stop(t0 + duration + 0.05);
}

// Layered tone = main + octave + detuned twin → richer & louder perception
function fatTone(
  bus: Bus,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = "sine",
  peak = 0.6,
) {
  tone(bus, freq, start, duration, type, peak);
  tone(bus, freq * 2, start, duration * 0.8, type, peak * 0.5);
  tone(bus, freq * 1.005, start, duration, type, peak * 0.7);
}

function sirenSweep(bus: Bus, start: number, from: number, to: number, dur: number, peak = 0.7) {
  const { ctx, out } = bus;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "sawtooth";
  o.connect(g);
  g.connect(out);
  const t0 = ctx.currentTime + start;
  o.frequency.setValueAtTime(from, t0);
  o.frequency.linearRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
  g.gain.setValueAtTime(peak, t0 + dur - 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export function playNotificationSound(id: SoundId, volume: VolumeLevel = "loud") {
  const ctx = getCtx();
  if (!ctx) return;
  const mult = VOLUME_OPTIONS.find((v) => v.id === volume)?.mult ?? 2;
  const bus = makeBus(ctx, mult);
  let totalMs = 800;
  try {
    switch (id) {
      case "ding":
        fatTone(bus, 880, 0, 0.55, "sine", 0.55);
        totalMs = 750;
        break;
      case "doorbell":
        fatTone(bus, 659.25, 0, 0.5, "sine", 0.6);
        fatTone(bus, 523.25, 0.38, 0.8, "sine", 0.6);
        totalMs = 1300;
        break;
      case "chime":
        fatTone(bus, 523.25, 0, 0.32, "triangle", 0.55);
        fatTone(bus, 659.25, 0.18, 0.32, "triangle", 0.55);
        fatTone(bus, 783.99, 0.36, 0.6, "triangle", 0.6);
        totalMs = 1150;
        break;
      case "alert":
        for (let i = 0; i < 4; i++) {
          fatTone(bus, 1100, i * 0.22, 0.16, "square", 0.55);
        }
        totalMs = 1200;
        break;
      case "siren":
        sirenSweep(bus, 0, 600, 1200, 0.5, 0.7);
        sirenSweep(bus, 0.5, 1200, 600, 0.5, 0.7);
        sirenSweep(bus, 1.0, 600, 1200, 0.5, 0.7);
        totalMs = 1700;
        break;
      case "buzzer":
        // low square buzz — very piercing
        tone(bus, 220, 0, 0.35, "square", 0.7);
        tone(bus, 221, 0, 0.35, "square", 0.7);
        tone(bus, 220, 0.45, 0.35, "square", 0.7);
        tone(bus, 221, 0.45, 0.35, "square", 0.7);
        totalMs = 1000;
        break;
      case "kitchen":
        // bright double bell, then a held tail — like a hotel/kitchen bell
        fatTone(bus, 1318.5, 0, 0.7, "sine", 0.7);   // E6
        fatTone(bus, 1046.5, 0.08, 0.9, "sine", 0.6); // C6
        fatTone(bus, 1318.5, 0.55, 0.6, "sine", 0.55);
        totalMs = 1500;
        break;
    }
  } catch {
    /* noop */
  }
  setTimeout(() => ctx.close().catch(() => {}), totalMs + 250);
}
