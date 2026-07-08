/**
 * A One Euro filter: low latency at slow motion, low jitter overall. Ideal for
 * noisy per-frame signals derived from hand landmarks.
 * See https://gery.casiez.net/1euro/
 */
export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;

  constructor(minCutoff = 1.0, beta = 0.02, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(value: number, timestampMs: number): number {
    if (this.xPrev === null) {
      this.xPrev = value;
      this.tPrev = timestampMs;
      return value;
    }

    const dt = Math.max((timestampMs - this.tPrev) / 1000, 1e-3);
    this.tPrev = timestampMs;

    const dx = (value - this.xPrev) / dt;
    const aD = OneEuroFilter.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    this.dxPrev = dxHat;

    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = OneEuroFilter.alpha(cutoff, dt);
    const xHat = a * value + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    return xHat;
  }

  reset(): void {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = 0;
  }
}

/** Exponential moving average for a single scalar. */
export class Ema {
  private value: number | null = null;
  constructor(private readonly factor = 0.4) {}

  filter(next: number): number {
    if (this.value === null) this.value = next;
    else this.value = this.factor * next + (1 - this.factor) * this.value;
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}

/** Suppresses values whose magnitude is below `threshold` to remove drift. */
export function deadzone(value: number, threshold: number): number {
  return Math.abs(value) < threshold ? 0 : value;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  const t = (value - inMin) / (inMax - inMin);
  return clamp(outMin + t * (outMax - outMin), Math.min(outMin, outMax), Math.max(outMin, outMax));
}
