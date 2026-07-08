import * as THREE from "three";

export const CENTER_HANDLE_INDEX = -1;

export interface EditablePrism {
  group: THREE.Group;
  mesh: THREE.Mesh;
  cornerHandles: THREE.Mesh[]; // 8 draggable corners
  centerHandle: THREE.Mesh; // 1 draggable center (moves the whole prism)
  /** All 9 grabbable handles (8 corners + center). */
  allHandles: THREE.Mesh[];
  /** Move corner `i` (0..7) to a new position in group-local space. */
  setCorner: (i: number, local: THREE.Vector3) => void;
  /** Restore the original rectangular prism. */
  reset: () => void;
  /** Emphasize a single handle (hover/grab feedback); pass null to clear. */
  highlight: (handle: THREE.Mesh | null) => void;
  /** Index of a handle in `allHandles`, or CENTER_HANDLE_INDEX for center. */
  cornerIndexOf: (handle: THREE.Mesh) => number;
}

const HANDLE_EMISSIVE = 0x3b82f6;
const HANDLE_HOT = 0xfbbf24;

function makeHandle(radius: number, isCenter: boolean): THREE.Mesh {
  const geo = new THREE.SphereGeometry(radius, 20, 16);
  const mat = new THREE.MeshStandardMaterial({
    color: isCenter ? 0xf472b6 : 0xffffff,
    emissive: HANDLE_EMISSIVE,
    emissiveIntensity: isCenter ? 0.5 : 0.25,
    metalness: 0.1,
    roughness: 0.4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  return mesh;
}

export function createPrism(width = 2, height = 1.4, depth = 1.4): EditablePrism {
  const group = new THREE.Group();

  const geometry = new THREE.BoxGeometry(width, height, depth);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;

  // Map each of BoxGeometry's 24 vertices to one of 8 logical corners, keyed by
  // the sign of its original coordinates. Moving a corner updates every vertex
  // that shares that corner so the box topology stays intact.
  const cornerOf = (x: number, y: number, z: number) =>
    (x > 0 ? 1 : 0) | (y > 0 ? 2 : 0) | (z > 0 ? 4 : 0);

  const vertexCorner: number[] = [];
  const originalCorners: THREE.Vector3[] = Array.from({ length: 8 }, () => new THREE.Vector3());
  for (let v = 0; v < position.count; v++) {
    const x = position.getX(v);
    const y = position.getY(v);
    const z = position.getZ(v);
    const c = cornerOf(x, y, z);
    vertexCorner[v] = c;
    originalCorners[c].set(x, y, z);
  }

  const material = new THREE.MeshStandardMaterial({
    color: 0x6ee7b7,
    metalness: 0.15,
    roughness: 0.4,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x0b0e14, transparent: true, opacity: 0.35 }),
  );
  mesh.add(edges);

  const handleRadius = Math.min(width, height, depth) * 0.09;
  const cornerHandles: THREE.Mesh[] = [];
  const currentCorners: THREE.Vector3[] = originalCorners.map((c) => c.clone());

  for (let c = 0; c < 8; c++) {
    const h = makeHandle(handleRadius, false);
    h.position.copy(originalCorners[c]);
    h.userData.cornerIndex = c;
    group.add(h);
    cornerHandles[c] = h;
  }

  const centerHandle = makeHandle(handleRadius * 1.15, true);
  centerHandle.userData.cornerIndex = CENTER_HANDLE_INDEX;
  group.add(centerHandle);

  const allHandles = [...cornerHandles, centerHandle];

  function updateCenter(): void {
    const c = new THREE.Vector3();
    for (const v of currentCorners) c.add(v);
    c.multiplyScalar(1 / currentCorners.length);
    centerHandle.position.copy(c);
  }
  updateCenter();

  function rebuildEdges(): void {
    (edges.geometry as THREE.BufferGeometry).dispose();
    edges.geometry = new THREE.EdgesGeometry(geometry, 1);
  }

  function setCorner(i: number, local: THREE.Vector3): void {
    if (i < 0 || i > 7) return;
    currentCorners[i].copy(local);
    for (let v = 0; v < position.count; v++) {
      if (vertexCorner[v] === i) position.setXYZ(v, local.x, local.y, local.z);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    cornerHandles[i].position.copy(local);
    updateCenter();
    rebuildEdges();
  }

  function reset(): void {
    for (let c = 0; c < 8; c++) setCorner(c, originalCorners[c].clone());
    group.position.set(0, 0, 0);
    group.rotation.set(0, 0, 0);
    group.scale.set(1, 1, 1);
  }

  let highlighted: THREE.Mesh | null = null;
  function highlight(handle: THREE.Mesh | null): void {
    if (highlighted && highlighted !== handle) {
      const m = highlighted.material as THREE.MeshStandardMaterial;
      m.emissive.setHex(HANDLE_EMISSIVE);
    }
    if (handle) {
      const m = handle.material as THREE.MeshStandardMaterial;
      m.emissive.setHex(HANDLE_HOT);
    }
    highlighted = handle;
  }

  function cornerIndexOf(handle: THREE.Mesh): number {
    return handle.userData.cornerIndex as number;
  }

  return {
    group,
    mesh,
    cornerHandles,
    centerHandle,
    allHandles,
    setCorner,
    reset,
    highlight,
    cornerIndexOf,
  };
}
