/**
 * Synthesize a short mono PCM WAV — a pleasant multi-note/chord demo for mock mode.
 * Fast to generate; duration is honored but capped for snappiness.
 */

const SAMPLE_RATE_DEFAULT = 22050;
const MOCK_CAP_SEC = 16;

/** C-major-ish scale degrees as frequency ratios from root */
const SCALE = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];

/** Chord progressions as scale-degree indices (0-based into SCALE) */
const PROGRESSIONS: number[][][] = [
  // I – V – vi – IV
  [
    [0, 2, 4],
    [4, 6, 1],
    [5, 0, 2],
    [3, 5, 0],
  ],
  // I – vi – ii – V
  [
    [0, 2, 4],
    [5, 0, 2],
    [1, 3, 5],
    [4, 6, 1],
  ],
  // I – IV – V – I
  [
    [0, 2, 4],
    [3, 5, 0],
    [4, 6, 1],
    [0, 2, 4],
  ],
];

export function synthesizeMockWav(options: {
  durationSec: number;
  sampleRate?: number;
  seed?: string;
}): Buffer {
  const sampleRate = options.sampleRate ?? SAMPLE_RATE_DEFAULT;
  // Honor requested duration reasonably; cap mock audio for snappy demos.
  const durationSec = Math.min(
    Math.max(options.durationSec, 1),
    MOCK_CAP_SEC
  );
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  const seed = hashSeed(options.seed ?? "alchemy");
  // Root around A3–D4 (220–294 Hz)
  const root = 220 + (seed % 75);
  const progression = PROGRESSIONS[seed % PROGRESSIONS.length];
  const chordCount = progression.length;
  const beatSec = Math.min(0.55, Math.max(0.35, durationSec / (chordCount * 3)));
  const chordDur = beatSec * 2; // two beats per chord feel

  // Soft pad + plucked arpeggio over the progression, looping if needed
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const chordIndex = Math.floor(t / chordDur) % chordCount;
    const localT = t - Math.floor(t / chordDur) * chordDur;
    const degrees = progression[chordIndex];

    // Chord pad (sustained soft sines)
    let pad = 0;
    for (let n = 0; n < degrees.length; n++) {
      const freq = root * SCALE[degrees[n] % SCALE.length] * (n === 0 ? 0.5 : 1);
      const env = softEnv(localT, chordDur, 0.04, 0.12);
      pad += env * Math.sin(2 * Math.PI * freq * t) * (n === 0 ? 0.22 : 0.14);
    }

    // Arpeggio notes within the chord
    const arpStep = beatSec / 2;
    const arpIdx = Math.min(
      degrees.length - 1,
      Math.floor(localT / arpStep) % degrees.length
    );
    const arpLocal = localT - Math.floor(localT / arpStep) * arpStep;
    const arpFreq = root * SCALE[degrees[arpIdx] % SCALE.length] * 2;
    const arpEnv = pluckEnv(arpLocal, arpStep * 0.9);
    const arp =
      arpEnv *
      (0.28 * Math.sin(2 * Math.PI * arpFreq * t) +
        0.1 * Math.sin(2 * Math.PI * arpFreq * 2 * t));

    // Gentle bass pulse on chord roots
    const bassFreq = root * SCALE[degrees[0] % SCALE.length] * 0.5;
    const bassEnv = softEnv(localT, chordDur, 0.02, 0.2);
    const bass = bassEnv * 0.2 * Math.sin(2 * Math.PI * bassFreq * t);

    // Light shimmer
    const shimmer =
      0.04 *
      softEnv(localT, chordDur, 0.1, 0.15) *
      Math.sin(2 * Math.PI * root * SCALE[4] * 4 * t);

    const masterEnv =
      Math.min(1, t * 6) * Math.min(1, (durationSec - t) * 4);
    const value = (pad + arp + bass + shimmer) * masterEnv;
    const clamped = Math.max(-1, Math.min(1, value));
    buffer.writeInt16LE(Math.floor(clamped * 30000), 44 + i * 2);
  }

  return buffer;
}

function softEnv(t: number, dur: number, attack: number, release: number): number {
  if (t < 0 || t > dur) return 0;
  const a = Math.min(1, t / Math.max(0.001, attack));
  const r = Math.min(1, (dur - t) / Math.max(0.001, release));
  return a * r;
}

function pluckEnv(t: number, dur: number): number {
  if (t < 0 || t > dur) return 0;
  const attack = 0.008;
  const a = Math.min(1, t / attack);
  const decay = Math.exp(-3.5 * (t / Math.max(0.001, dur)));
  return a * decay;
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}
