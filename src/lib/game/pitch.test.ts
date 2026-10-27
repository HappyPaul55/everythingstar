import { describe, expect, test } from "bun:test";
import {
  createPitchDetector,
  decimate,
  detectMidi,
  detectPitch,
  frequencyToMidi,
  midiToFrequency,
  rms,
} from "./pitch";

function sine(frequency: number, sampleRate: number, length: number, amplitude = 0.5) {
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    buffer[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return buffer;
}

/**
 * A sung note rather than a laboratory tone: a phase-integrated vibrato (not
 * `sin(f(t) * t)`, which is a different signal) and a stack of harmonics. A real
 * voice wobbles, and the detector must follow the wobble rather than the window's
 * average.
 */
function sung(
  frequency: number,
  sampleRate: number,
  length: number,
  depthSemitones = 0.5,
  rateHz = 5,
): Float32Array {
  const buffer = new Float32Array(length);
  let phase = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / sampleRate;
    const semitones = depthSemitones * Math.sin(2 * Math.PI * rateHz * t);
    phase += (2 * Math.PI * frequency * 2 ** (semitones / 12)) / sampleRate;
    for (let harmonic = 1; harmonic <= 6; harmonic += 1) {
      buffer[i] += (0.4 / harmonic) * Math.sin(harmonic * phase);
    }
  }
  return buffer;
}

describe("rms", () => {
  test("is zero for silence and positive for a signal", () => {
    expect(rms(new Float32Array(128))).toBe(0);
    expect(rms(sine(440, 48000, 128))).toBeGreaterThan(0);
  });
});

describe("detectPitch", () => {
  const sampleRate = 48000;
  const length = 2048;

  test("finds the fundamental of a pure tone", () => {
    const frequency = detectPitch(sine(440, sampleRate, length), sampleRate);
    expect(frequency).not.toBeNull();
    expect(frequency!).toBeCloseTo(440, 0);
    expect(Math.abs(frequencyToMidi(frequency!) - 69)).toBeLessThan(0.3);
  });

  test("handles a low male-range note", () => {
    const frequency = detectPitch(sine(110, sampleRate, length), sampleRate);
    expect(frequency).not.toBeNull();
    expect(Math.abs(frequencyToMidi(frequency!) - 45)).toBeLessThan(1);
  });

  test("returns a MIDI number from detectMidi", () => {
    const midi = detectMidi(sine(523.25, sampleRate, length), sampleRate);
    expect(midi).not.toBeNull();
    expect(midi!).toBeCloseTo(72, 0);
  });

  test("rejects silence", () => {
    expect(detectPitch(new Float32Array(length), sampleRate)).toBeNull();
  });

  test("rejects a signal below the silence gate", () => {
    expect(detectPitch(sine(440, sampleRate, length, 0.001), sampleRate)).toBeNull();
  });

  test("finds the fundamental under a weak fundamental", () => {
    // A tone whose fundamental is quieter than its harmonics.
    const buffer = new Float32Array(length);
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      buffer[i] =
        0.1 * Math.sin(2 * Math.PI * 220 * t) +
        0.5 * Math.sin(2 * Math.PI * 440 * t) +
        0.3 * Math.sin(2 * Math.PI * 660 * t);
    }
    const frequency = detectPitch(buffer, sampleRate);
    expect(frequency).not.toBeNull();
    expect(Math.abs(frequencyToMidi(frequency!) - 57)).toBeLessThan(0.5);
  });

  test("follows a voice's vibrato instead of the window's average", () => {
    const detector = createPitchDetector();
    const midi = detector.detectMidi(sung(196, sampleRate, length), sampleRate).midi;
    expect(midi).not.toBeNull();
    expect(Math.abs(midi! - 55)).toBeLessThan(0.8);
  });

  test("ignores a rumble below the sung range", () => {
    // 40 Hz is below C2; it is room noise, not a note a singer is asked for.
    expect(detectPitch(sine(40, sampleRate, length), sampleRate)).toBeNull();
  });
});

describe("note conversion", () => {
  test("round-trips MIDI and frequency", () => {
    for (const midi of [40, 57, 69, 84]) {
      expect(frequencyToMidi(midiToFrequency(midi))).toBeCloseTo(midi, 6);
    }
  });

  test("maps A4 to MIDI 69", () => {
    expect(frequencyToMidi(440)).toBeCloseTo(69, 6);
  });
});

describe("decimate", () => {
  const sampleRate = 48000;
  const length = 2048;

  test("keeps a low tone and lengths the output by the factor", () => {
    const input = sine(200, sampleRate, length);
    const out = decimate(input, 3, sampleRate);
    expect(out.length).toBe(Math.floor(length / 3));
    // A tone well inside the passband survives at full amplitude.
    expect(rms(out)).toBeGreaterThan(rms(input) * 0.9);
  });

  test("suppresses what would alias from above the decimated Nyquist", () => {
    const input = sine(11000, sampleRate, length);
    const out = decimate(input, 3, sampleRate);
    expect(rms(out)).toBeLessThan(rms(input) * 0.1);
  });

  test("is a no-op for a factor of one", () => {
    const input = sine(440, sampleRate, length);
    const out = decimate(input, 1, sampleRate);
    expect(out.length).toBe(length);
    expect(Array.from(out.slice(0, 4))).toEqual(Array.from(input.slice(0, 4)));
  });
});

describe("createPitchDetector", () => {
  const sampleRate = 48000;
  const length = 2048;

  test("detects a tone through decimation, with clarity", () => {
    const detector = createPitchDetector();
    const { midi, clarity } = detector.detectMidi(sine(440, sampleRate, length), sampleRate);
    expect(midi).not.toBeNull();
    expect(midi!).toBeCloseTo(69, 0);
    expect(clarity).toBeGreaterThan(0.8);
  });

  test("covers the soprano range above 1 kHz", () => {
    const detector = createPitchDetector({ maxFrequency: 1500 });
    const { midi } = detector.detectMidi(sine(1200, sampleRate, length), sampleRate);
    expect(midi).not.toBeNull();
    // D6 (~1174.7 Hz) is MIDI ~86; a lower cap would report an octave down.
    expect(midi!).toBeGreaterThan(84);
    expect(midi!).toBeLessThan(89);
  });

  test("reuses its buffers across successive frames", () => {
    const detector = createPitchDetector();
    const first = detector.detect(sine(220, sampleRate, length), sampleRate);
    const second = detector.detect(sine(660, sampleRate, length), sampleRate);
    expect(first.frequency!).toBeCloseTo(220, 0);
    expect(second.frequency!).toBeCloseTo(660, 0);
  });

  test("reports no note and no clarity for silence", () => {
    const detector = createPitchDetector();
    const { midi, clarity } = detector.detectMidi(new Float32Array(length), sampleRate);
    expect(midi).toBeNull();
    expect(clarity).toBe(0);
  });
});
