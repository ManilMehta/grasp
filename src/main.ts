import { ShapeController } from "./controller";
import { extractGestures } from "./gestures";
import { createHandTracker } from "./hands";
import { Overlay } from "./overlay";
import { createScene } from "./scene";
import { createToolbar } from "./tools";

const viewport = document.getElementById("viewport") as HTMLCanvasElement;
const overlayCanvas = document.getElementById("overlay") as HTMLCanvasElement;
const readoutEl = document.getElementById("readout") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;
const statusText = document.getElementById("status-text") as HTMLElement;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const toolbarEl = document.getElementById("toolbar") as HTMLElement;
const hintEl = document.getElementById("hint") as HTMLElement;

const scene = createScene(viewport);
const controller = new ShapeController();
const overlay = new Overlay(overlayCanvas, readoutEl);

const toolbar = createToolbar(toolbarEl, {
  initial: "rotate",
  onSelect: (tool) => {
    hintEl.textContent = toolbar.getHint(tool);
  },
  onReset: () => scene.prism.reset(),
});
hintEl.textContent = toolbar.getHint(toolbar.getActive());

scene.render();

async function start(): Promise<void> {
  startBtn.disabled = true;
  statusText.textContent = "Requesting camera and loading hand model...";

  let tracker;
  try {
    tracker = await createHandTracker({ swapHandedness: true });
  } catch (err) {
    console.error(err);
    statusText.textContent =
      "Could not start the camera. Check permissions and reload. " +
      ((err as Error)?.message ?? "");
    startBtn.disabled = false;
    startBtn.textContent = "Retry";
    return;
  }

  statusEl.classList.add("hidden");

  function frame() {
    try {
      const now = performance.now();
      const hands = tracker!.detect(now);
      const gestures = extractGestures(hands);
      const readout = controller.update(
        gestures,
        scene.prism,
        scene.camera,
        toolbar.getActive(),
        now,
      );

      scene.render();
      overlay.draw(tracker!.video, hands, readout);
    } catch (err) {
      console.error("frame error", err);
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

startBtn.addEventListener("click", () => void start());
