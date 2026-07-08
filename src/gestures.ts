import type { HandsResult, Landmark } from "./hands";

// MediaPipe hand landmark indices we rely on.
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_TIP = 20;

/** Pinch is considered "closed" (a grab) below this normalized distance. */
export const GRAB_THRESHOLD = 0.45;

export interface HandFeatures {
  present: boolean;
  /** Thumb-tip to index-tip distance, normalized by hand span (~0 closed .. ~2 open). */
  pinch: number;
  /** True when the thumb and index are pinched together. */
  grabbing: boolean;
  /** Palm center in normalized image coords (0..1), x already un-mirrored. */
  palmX: number;
  palmY: number;
  /** Thumb/index midpoint (the pinch point) in normalized coords, x un-mirrored. */
  pinchX: number;
  pinchY: number;
}

export interface GestureState {
  left: HandFeatures;
  right: HandFeatures;
}

const ABSENT: HandFeatures = {
  present: false,
  pinch: 0,
  grabbing: false,
  palmX: 0.5,
  palmY: 0.5,
  pinchX: 0.5,
  pinchY: 0.5,
};

function dist2d(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function handSpan(lm: Landmark[]): number {
  // Wrist to middle-finger knuckle: a stable, scale-invariant reference length.
  return Math.max(dist2d(lm[WRIST], lm[MIDDLE_MCP]), 1e-4);
}

function computeFeatures(lm: Landmark[] | undefined): HandFeatures {
  if (!lm || lm.length < 21) return ABSENT;

  const span = handSpan(lm);
  const pinch = dist2d(lm[THUMB_TIP], lm[INDEX_TIP]) / span;

  // Palm center: average the wrist and the four finger knuckles / tips region.
  const anchors = [
    lm[WRIST],
    lm[INDEX_MCP],
    lm[MIDDLE_MCP],
    lm[MIDDLE_TIP],
    lm[RING_TIP],
    lm[PINKY_TIP],
  ];
  let sx = 0;
  let sy = 0;
  for (const p of anchors) {
    sx += p.x;
    sy += p.y;
  }
  const palmX = 1 - sx / anchors.length; // un-mirror to match the flipped preview
  const palmY = sy / anchors.length;

  const pinchX = 1 - (lm[THUMB_TIP].x + lm[INDEX_TIP].x) / 2;
  const pinchY = (lm[THUMB_TIP].y + lm[INDEX_TIP].y) / 2;

  return {
    present: true,
    pinch,
    grabbing: pinch < GRAB_THRESHOLD,
    palmX,
    palmY,
    pinchX,
    pinchY,
  };
}

export function extractGestures(hands: HandsResult): GestureState {
  return {
    left: computeFeatures(hands.Left),
    right: computeFeatures(hands.Right),
  };
}
