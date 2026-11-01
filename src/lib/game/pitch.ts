/**
 * Real-time monophonic pitch detection.
 *
 * A small, dependency-free implementation of the YIN algorithm (de Cheveigné &
 * Kawahara, 2002): a difference function, cumulative-mean normalisation, an
 * absolute threshold and parabolic interpolation. YIN is used instead of an FFT
 * because it is accurate on low, harmonic-rich voices without binning tricks, and
 * it works directly on the time-domain samples an `AnalyserNode` provides.
 *
 * Two things make it cheap enough to run every animation frame on the main
 * thread: the input is anti-alias **decimated** before analysis (a voice carries
 * nothing useful above ~1 kHz, so most of the samples are surplus to the low lags
 * YIN cares about), and {@link createPitchDetector} **reuses its scratch buffers**
 * across frames instead of allocating on every call. Together they are roughly a
 * tenfold speed-up with no loss of accuracy on synthetic tones.
 *
 * This module is pure and unit-tested against synthetic buffers, so it can be
 * reasoned about (and corrected) without a microphone. What the game *makes* of a
 * pitch — a row, a tolerance, a note won or lost — is `singing.ts`.
 */

/** Reference frequency for A4. */
const A4 = 440;

/** Cascaded taps in the anti-alias filter (~a few thousand multiply-adds). */
const DECIMATE_TAPS = 63;

export interface PitchOptions {
  /** Lowest detectable frequency in Hz (default 65, roughly C2). */
  minFrequency?: number;
  /** Highest detectable frequency in Hz (default 1500, roughly F#6). */
  maxFrequency?: number;
  /** YIN absolute threshold; lower is stricter (default 0.15). */
  threshold?: number;
  /** RMS below which the frame is treated as silence (default 0.008). */
  silenceRms?: number;
}

const DEFAULTS = {
  minFrequency: 65,
  maxFrequency: 1500,
  threshold: 0.15,
  silenceRms: 0.008,
  /** Decimation factor used by {@link createPitchDetector}. */
  decimate: 3,
} as const;

/** A resolved pitch analysis: the frequency (if any) and YIN's clarity. */
export interface PitchSample {
  /** Fundamental frequency in Hz, or `null` when silent or unvoiced. */
  frequency: number | null;
  /**
   * YIN clarity 0..1 (1 = perfectly periodic), i.e. one minus the aperiodicity at
   * the chosen lag. Useful for weighting or gating uncertain frames.
   */
  clarity: number;
}

/** Reused difference / cumulative-mean buffers, keyed by the lag range. */
interface Scratch {
  diff: Float32Array;
  cmnd: Float32Array;
}

type ResolvedPitchOptions = Required<PitchOptions>;

/** Root-mean-square amplitude of a sample buffer. */
export function rms(buffer: Float32Array): number {
  if (buffer.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

function resolveOptions(options: PitchOptions): ResolvedPitchOptions {
  return {
    minFrequency: options.minFrequency ?? DEFAULTS.minFrequency,
    maxFrequency: options.maxFrequency ?? DEFAULTS.maxFrequency,
    threshold: options.threshold ?? DEFAULTS.threshold,
    silenceRms: options.silenceRms ?? DEFAULTS.silenceRms,
  };
}

/**
 * The YIN core. `scratch` is grown in place and reused, so a caller that runs
 * this every frame allocates nothing once the lag range is known.
 */
function yin(
  buffer: Float32Array,
  sampleRate: number,
  options: ResolvedPitchOptions,
  scratch: Scratch,
): PitchSample {
  const size = buffer.length;
  if (size < 8 || !(sampleRate > 0)) return { frequency: null, clarity: 0 };
  if (rms(buffer) < options.silenceRms) return { frequency: null, clarity: 0 };

  const tauMin = Math.max(2, Math.floor(sampleRate / options.maxFrequency));
  const tauMax = Math.min(size - 1, Math.ceil(sampleRate / options.minFrequency));
  if (tauMax <= tauMin) return { frequency: null, clarity: 0 };

  if (scratch.diff.length < tauMax + 1) {
    scratch.diff = new Float32Array(tauMax + 1);
    scratch.cmnd = new Float32Array(tauMax + 1);
  }
  const diff = scratch.diff;
  const cmnd = scratch.cmnd;

  // Difference function d[tau], restricted to the meaningful lag range.
  for (let tau = 1; tau <= tauMax; tau += 1) {
    let sum = 0;
    const limit = size - tau;
    for (let i = 0; i < limit; i += 1) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    diff[tau] = sum;
  }

  // Cumulative mean normalised difference, so the first true minimum wins.
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau += 1) {
    running += diff[tau];
    cmnd[tau] = running === 0 ? 1 : (diff[tau] * tau) / running;
  }

  // The first lag below the threshold, then walk to its local minimum.
  let tauEstimate = -1;
  for (let tau = tauMin; tau <= tauMax; tau += 1) {
    if (cmnd[tau] < options.threshold) {
      while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau += 1;
      tauEstimate = tau;
      break;
    }
  }
  if (tauEstimate === -1) return { frequency: null, clarity: 0 };

  // Parabolic interpolation around the minimum for sub-sample accuracy.
  let bestTau = tauEstimate;
  if (tauEstimate > tauMin && tauEstimate < tauMax) {
    const s0 = cmnd[tauEstimate - 1];
    const s1 = cmnd[tauEstimate];
    const s2 = cmnd[tauEstimate + 1];
    const denom = s0 - 2 * s1 + s2;
    if (denom !== 0) {
      const shift = (s0 - s2) / (2 * denom);
      bestTau = tauEstimate + Math.max(-1, Math.min(1, shift));
    }
  }
  if (!(bestTau > 0)) return { frequency: null, clarity: 0 };

  const frequency = sampleRate / bestTau;
  if (frequency < options.minFrequency || frequency > options.maxFrequency) {
    return { frequency: null, clarity: 0 };
  }
  const clarity = Math.max(0, Math.min(1, 1 - cmnd[tauEstimate]));
  return { frequency, clarity };
}

/** Analyse a mono buffer once, allocating fresh scratch (the simple path). */
function analyse(
  buffer: Float32Array,
  sampleRate: number,
  options: PitchOptions,
): PitchSample {
  return yin(buffer, sampleRate, resolveOptions(options), {
    diff: new Float32Array(0),
    cmnd: new Float32Array(0),
  });
}

/**
 * The fundamental frequency of a mono buffer in Hz, or `null` when the frame is
 * silent or has no confident pitch.
 */
export function detectPitch(
  buffer: Float32Array,
  sampleRate: number,
  options: PitchOptions = {},
): number | null {
  return analyse(buffer, sampleRate, options).frequency;
}

/**
 * A unit-gain Hamming-windowed-sinc low-pass, symmetric about its centre.
 * `cutoffHz` is the −6 dB point; content above it rolls into the stopband.
 */
function lowpassTaps(
  cutoffHz: number,
  sampleRate: number,
  length = DECIMATE_TAPS,
): Float32Array {
  const taps = new Float32Array(length);
  const centre = (length - 1) / 2;
  const fc = cutoffHz / sampleRate;
  let sum = 0;
  for (let n = 0; n < length; n += 1) {
    const x = n - centre;
    const sinc = x === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * x) / (Math.PI * x);
    const window = 0.54 - 0.46 * Math.cos((2 * Math.PI * n) / (length - 1));
    const value = sinc * window;
    taps[n] = value;
    sum += value;
  }
  for (let n = 0; n < length; n += 1) taps[n] /= sum;
  return taps;
}

/**
 * Anti-aliased decimation by an integer factor: low-pass at the decimated Nyquist,
 * then keep every `factor`-th sample. The low-pass matters because the samples
 * dropped on the way down would otherwise fold back into the band we listen to.
 * Writes into `out` when it is large enough, so a caller can reuse a single buffer
 * across frames.
 */
export function decimate(
  buffer: Float32Array,
  factor: number,
  sampleRate: number,
  out?: Float32Array,
  taps?: Float32Array,
): Float32Array {
  const step = Math.max(1, Math.floor(factor));
  if (step === 1) {
    const passthrough =
      out && out.length >= buffer.length ? out : new Float32Array(buffer.length);
    passthrough.set(buffer);
    return passthrough.length === buffer.length
      ? passthrough
      : passthrough.subarray(0, buffer.length);
  }

  const outLength = Math.floor(buffer.length / step);
  const result = out && out.length >= outLength ? out : new Float32Array(outLength);
  // A live detector analyses a frame every ~16 ms, and re-deriving the window is a
  // fresh `Float32Array` plus 63 windowed-sinc taps (two trig calls each) on the
  // main thread — per frame, for a filter that never changes. The caller that owns
  // the stream keeps the table; a one-off call builds it here.
  const table = taps ?? lowpassTaps(0.4 * (sampleRate / step), sampleRate);
  const centre = (table.length - 1) / 2;

  for (let k = 0; k < outLength; k += 1) {
    const base = k * step - centre;
    let acc = 0;
    for (let j = 0; j < table.length; j += 1) {
      let index = base + j;
      if (index < 0) index = 0;
      else if (index >= buffer.length) index = buffer.length - 1;
      acc += table[j] * buffer[index];
    }
    result[k] = acc;
  }
  return result.length === outLength ? result : result.subarray(0, outLength);
}

/** Convert a frequency in Hz to a MIDI note number (may be fractional). */
export function frequencyToMidi(frequency: number, a4 = A4): number {
  return 69 + 12 * Math.log2(frequency / a4);
}

/** Convert a MIDI note number to a frequency in Hz. */
export function midiToFrequency(midi: number, a4 = A4): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

/**
 * Detect a pitch and return it as a MIDI number, or `null`. A track's rows are
 * semitones from its `rootMidi`, so this is the bridge between a microphone and a
 * chart: `frequencyToMidi(440)` is the MIDI note row 0 sounds when `rootMidi` is 57.
 */
export function detectMidi(
  buffer: Float32Array,
  sampleRate: number,
  options?: PitchOptions,
): number | null {
  const frequency = detectPitch(buffer, sampleRate, options);
  return frequency === null ? null : frequencyToMidi(frequency);
}

export interface PitchDetectorOptions extends PitchOptions {
  /** Integer decimation factor applied before detection (default 3). */
  decimate?: number;
}

export interface PitchDetector {
  /** Analyse one mono frame and return the frequency and clarity. */
  detect(buffer: Float32Array, sampleRate: number): PitchSample;
  /** As {@link detect}, but returning a MIDI note number. */
  detectMidi(
    buffer: Float32Array,
    sampleRate: number,
  ): { midi: number | null; clarity: number };
  /** Drop the reused buffers (e.g. when the microphone stops). */
  reset(): void;
}

/**
 * A stateful detector for a live stream: it decimates each frame and reuses its
 * difference / cumulative-mean buffers, so a per-frame call allocates nothing
 * after the first. `detect` takes the input at its true `sampleRate`; the
 * decimation and the lag range are handled internally.
 */
export function createPitchDetector(
  options: PitchDetectorOptions = {},
): PitchDetector {
  const factor = Math.max(1, Math.floor(options.decimate ?? DEFAULTS.decimate));
  const resolved = resolveOptions(options);
  const scratch: Scratch = { diff: new Float32Array(0), cmnd: new Float32Array(0) };
  let decimated: Float32Array | null = null;
  /** The low-pass table for this stream's rate and factor, made once. */
  let taps: Float32Array | null = null;
  let tapsKey = "";

  const detect = (buffer: Float32Array, sampleRate: number): PitchSample => {
    if (factor === 1) return yin(buffer, sampleRate, resolved, scratch);
    if (!(sampleRate > 0)) return { frequency: null, clarity: 0 };
    const key = `${factor}:${sampleRate}`;
    if (tapsKey !== key) {
      taps = lowpassTaps(0.4 * (sampleRate / factor), sampleRate);
      tapsKey = key;
    }
    decimated = decimate(buffer, factor, sampleRate, decimated ?? undefined, taps ?? undefined);
    return yin(decimated, sampleRate / factor, resolved, scratch);
  };

  return {
    detect,
    detectMidi(buffer, sampleRate) {
      const { frequency, clarity } = detect(buffer, sampleRate);
      return {
        midi: frequency === null ? null : frequencyToMidi(frequency),
        clarity,
      };
    },
    reset() {
      scratch.diff = new Float32Array(0);
      scratch.cmnd = new Float32Array(0);
      decimated = null;
    },
  };
}
