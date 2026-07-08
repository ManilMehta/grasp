import * as THREE from "three";
import { createPrism, type EditablePrism } from "./prism";

export interface SceneHandles {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  prism: EditablePrism;
  render: () => void;
}

export function createScene(canvas: HTMLCanvasElement): SceneHandles {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e14);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 0, 6);

  const prism = createPrism();
  scene.add(prism.group);

  const grid = new THREE.GridHelper(20, 20, 0x1f2a3a, 0x141b26);
  grid.position.y = -2.5;
  scene.add(grid);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(3, 5, 4);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x88aaff, 0.8);
  fillLight.position.set(-4, -2, 2);
  scene.add(fillLight);

  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height || 1;
      camera.updateProjectionMatrix();
    }
  }

  function render() {
    resize();
    renderer.render(scene, camera);
  }

  window.addEventListener("resize", resize);
  resize();

  return { renderer, scene, camera, prism, render };
}
