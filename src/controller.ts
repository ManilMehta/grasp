import * as THREE from "three";
import type { GestureState } from "./gestures";
import type { EditablePrism } from "./prism";
import { CENTER_HANDLE_INDEX } from "./prism";
import type { ToolId } from "./tools";
import { OneEuroFilter, clamp, deadzone } from "./smoothing";

const SCALE_MIN = 0.3;
const SCALE_MAX = 4.0;
const SCALE_SENSITIVITY = 3.5;

const ROTATE_SENSITIVITY = 6.0;
const DRAG_DEADZONE = 0.004;

// How close (in normalized device coords) the pinch point must be to a handle
// to pick it up.
const PICK_RADIUS = 0.14;

export interface ControllerReadout {
  tool: ToolId;
  rightPresent: boolean;
  engaged: boolean;
  scale: number;
  targetLabel: string;
}

export class ShapeController {
  private px = new OneEuroFilter(1.5, 0.02);
  private py = new OneEuroFilter(1.5, 0.02);

  private tool: ToolId = "rotate";
  private engaged = false;
  private lastX = 0;
  private lastY = 0;

  // Edit-tool state
  private grabbed: THREE.Mesh | null = null;
  private grabDepth = 0;
  private grabOffset = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  setTool(tool: ToolId): void {
    if (tool === this.tool) return;
    this.tool = tool;
    this.disengage();
  }

  private disengage(): void {
    this.engaged = false;
    this.grabbed = null;
    this.px.reset();
    this.py.reset();
  }

  update(
    state: GestureState,
    prism: EditablePrism,
    camera: THREE.PerspectiveCamera,
    tool: ToolId,
    timestampMs: number,
  ): ControllerReadout {
    this.setTool(tool);
    const right = state.right;

    let targetLabel = "--";

    if (!right.present) {
      this.disengage();
      prism.highlight(null);
      return this.readout(right.present, prism, targetLabel);
    }

    switch (this.tool) {
      case "rotate":
        targetLabel = this.doRotate(state, prism, timestampMs);
        break;
      case "scale":
        targetLabel = this.doScale(state, prism, timestampMs);
        break;
      case "edit":
        targetLabel = this.doEdit(state, prism, camera, timestampMs);
        break;
    }

    return this.readout(right.present, prism, targetLabel);
  }

  private doRotate(state: GestureState, prism: EditablePrism, t: number): string {
    const right = state.right;
    if (right.grabbing) {
      const x = this.px.filter(right.palmX, t);
      const y = this.py.filter(right.palmY, t);
      if (!this.engaged) {
        this.engaged = true;
        this.lastX = x;
        this.lastY = y;
      } else {
        const dx = deadzone(x - this.lastX, DRAG_DEADZONE);
        const dy = deadzone(y - this.lastY, DRAG_DEADZONE);
        prism.group.rotation.y += dx * ROTATE_SENSITIVITY;
        prism.group.rotation.x += dy * ROTATE_SENSITIVITY;
        this.lastX = x;
        this.lastY = y;
      }
      return "rotating";
    }
    this.disengage();
    return "open";
  }

  private doScale(state: GestureState, prism: EditablePrism, t: number): string {
    const right = state.right;
    if (right.grabbing) {
      const y = this.py.filter(right.palmY, t);
      if (!this.engaged) {
        this.engaged = true;
        this.lastY = y;
      } else {
        const dy = deadzone(y - this.lastY, DRAG_DEADZONE);
        // Moving the hand up (dy < 0) grows the shape.
        const factor = 1 - dy * SCALE_SENSITIVITY;
        const next = clamp(prism.group.scale.x * factor, SCALE_MIN, SCALE_MAX);
        prism.group.scale.setScalar(next);
        this.lastY = y;
      }
      return "scaling";
    }
    this.disengage();
    return "open";
  }

  private doEdit(
    state: GestureState,
    prism: EditablePrism,
    camera: THREE.PerspectiveCamera,
    t: number,
  ): string {
    const right = state.right;
    const ndcX = this.px.filter(right.pinchX, t) * 2 - 1;
    const ndcY = 1 - this.py.filter(right.pinchY, t) * 2;

    if (right.grabbing) {
      if (!this.engaged) {
        const picked = this.pickHandle(prism, camera, ndcX, ndcY);
        if (picked) {
          this.engaged = true;
          this.grabbed = picked;
          const world = picked.getWorldPosition(new THREE.Vector3());
          this.grabDepth = world.clone().project(camera).z;
          const pointerWorld = this.unproject(camera, ndcX, ndcY, this.grabDepth);
          this.grabOffset.copy(world).sub(pointerWorld);
        }
      } else if (this.grabbed) {
        const desired = this.unproject(camera, ndcX, ndcY, this.grabDepth).add(this.grabOffset);
        const idx = prism.cornerIndexOf(this.grabbed);
        if (idx === CENTER_HANDLE_INDEX) {
          const currentWorld = this.grabbed.getWorldPosition(this.tmp);
          prism.group.position.add(desired.sub(currentWorld));
        } else {
          prism.group.worldToLocal(desired);
          prism.setCorner(idx, desired);
        }
      }
    } else {
      this.engaged = false;
      this.grabbed = null;
    }

    // Hover / grab feedback.
    if (this.grabbed) {
      prism.highlight(this.grabbed);
      const idx = prism.cornerIndexOf(this.grabbed);
      return idx === CENTER_HANDLE_INDEX ? "move center" : `corner ${idx}`;
    }
    const hover = this.pickHandle(prism, camera, ndcX, ndcY);
    prism.highlight(hover);
    if (hover) {
      const idx = prism.cornerIndexOf(hover);
      return idx === CENTER_HANDLE_INDEX ? "over center" : `over corner ${idx}`;
    }
    return "reach a point";
  }

  private pickHandle(
    prism: EditablePrism,
    camera: THREE.PerspectiveCamera,
    ndcX: number,
    ndcY: number,
  ): THREE.Mesh | null {
    let best: THREE.Mesh | null = null;
    let bestDist = PICK_RADIUS;
    for (const handle of prism.allHandles) {
      const p = handle.getWorldPosition(this.tmp).project(camera);
      const d = Math.hypot(p.x - ndcX, p.y - ndcY);
      if (d < bestDist) {
        bestDist = d;
        best = handle;
      }
    }
    return best;
  }

  private unproject(
    camera: THREE.PerspectiveCamera,
    ndcX: number,
    ndcY: number,
    ndcZ: number,
  ): THREE.Vector3 {
    return new THREE.Vector3(ndcX, ndcY, ndcZ).unproject(camera);
  }

  private readout(rightPresent: boolean, prism: EditablePrism, targetLabel: string): ControllerReadout {
    return {
      tool: this.tool,
      rightPresent,
      engaged: this.engaged,
      scale: prism.group.scale.x,
      targetLabel,
    };
  }
}
