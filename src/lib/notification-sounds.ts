// Royalty-free LOUD alert sounds generated via Web Audio API.
// Only siren-style sounds — designed to cut through a noisy kitchen.

export type SoundId = "siren" | "airhorn" | "emergency";

export const SOUND_OPTIONS: { id: SoundId; label: string; description: string }[] = [
  { id: "siren", label: "Siren ตำรวจ (แนะนำ)", description: "ไซเรนกวาดสองโทน วน 3 รอบ ดังมาก" },
  { id: "airhorn", label: "Air Horn แตรลม", description: "แตรลมโทนต่ำ ก้องสนาม สะเทือนหู" },
  { id: "emergency", label: "Emergency รถพยาบาล", description: "สลับสองโทนเร็วๆ คล้ายรถฉุกเฉิน" },
];

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
  out: AudioNode;
}

function makeBus(ctx: Ctx, volumeMult: number): Bus {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.15;

  const master = ctx.createGain();
  master.gain.value = volumeMult;

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
  g.gain.setValueAtTime(peak, t0 + duration - 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  o.start(t0);
  o.stop(t0 + duration + 0.05);
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

// Air horn: low fundamental + layered harmonics, sustained blast
function airHorn(bus: Bus, start: number, dur: number, peak = 0.75) {
  tone(bus, 220, start, dur, "sawtooth", peak);
  tone(bus, 330, start, dur, "sawtooth", peak * 0.7);
  tone(bus, 440, start, dur, "square", peak * 0.5);
  tone(bus, 110, start, dur, "sawtooth", peak * 0.6);
}

export function playNotificationSound(id: SoundId, volume: VolumeLevel = "loud") {
  const ctx = getCtx();
  if (!ctx) return;
  const mult = VOLUME_OPTIONS.find((v) => v.id === volume)?.mult ?? 2;
  const bus = makeBus(ctx, mult);
  let totalMs = 1500;
  try {
    switch (id) {
      case "siren":
        sirenSweep(bus, 0, 600, 1200, 0.5, 0.75);
        sirenSweep(bus, 0.5, 1200, 600, 0.5, 0.75);
        sirenSweep(bus, 1.0, 600, 1200, 0.5, 0.75);
        totalMs = 1700;
        break;
      case "airhorn":
        // one long blast + short blast
        airHorn(bus, 0, 0.9, 0.75);
        airHorn(bus, 1.05, 0.35, 0.75);
        totalMs = 1500;
        break;
      case "emergency":
        // ambulance-style: rapid alternation between two fixed tones
        for (let i = 0; i < 4; i++) {
          tone(bus, 950, i * 0.32, 0.28, "sawtooth", 0.7);
          tone(bus, 650, i * 0.32 + 0.16, 0.28, "sawtooth", 0.7);
        }
        totalMs = 1500;
        break;
    }
  } catch {
    /* noop */
  }
  setTimeout(() => ctx.close().catch(() => {}), totalMs + 250);
}
