import type { ControllerReadout } from "./controller";
import type { HandsResult, Landmark } from "./hands";

// Pairs of landmark indices that form the hand skeleton.
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const HAND_COLORS: Record<string, string> = {
  Left: "#6ee7b7",
  Right: "#fbbf24",
};

export class Overlay {
  private ctx: CanvasRenderingContext2D;

  constructor(
    private canvas: HTMLCanvasElement,
    private readoutEl: HTMLElement,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable for overlay");
    this.ctx = ctx;
  }

  draw(video: HTMLVideoElement, hands: HandsResult, readout: ControllerReadout): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;

    // Mirror the webcam feed so it reads like a selfie.
    ctx.save();
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();

    this.drawHand(hands.Left, HAND_COLORS.Left, w, h);
    this.drawHand(hands.Right, HAND_COLORS.Right, w, h);

    this.updateReadout(hands, readout);
  }

  private drawHand(lm: Landmark[] | undefined, color: string, w: number, h: number): void {
    if (!lm || lm.length < 21) return;
    const { ctx } = this;
    // Landmarks are in the un-mirrored image space; mirror x for the flipped view.
    const px = (p: Landmark) => (1 - p.x) * w;
    const py = (p: Landmark) => p.y * h;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(px(lm[a]), py(lm[a]));
      ctx.lineTo(px(lm[b]), py(lm[b]));
      ctx.stroke();
    }

    ctx.fillStyle = color;
    for (const p of lm) {
      ctx.beginPath();
      ctx.arc(px(p), py(p), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private updateReadout(hands: HandsResult, r: ControllerReadout): void {
    const right = hands.Right ? "detected" : "--";
    const lines = [
      `tool    ${r.tool.toUpperCase()}`,
      `r.hand  ${right}  ${r.engaged ? "GRAB" : "open"}`,
      `scale   ${r.scale.toFixed(2)}x`,
      `target  ${r.targetLabel}`,
      ``,
      `pick a tool, then pinch`,
      `your right hand to use it`,
    ];
    this.readoutEl.textContent = lines.join("\n");
  }
}
