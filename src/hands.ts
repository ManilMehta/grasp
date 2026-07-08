import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type HandLabel = "Left" | "Right";

export interface HandsResult {
  Left?: Landmark[];
  Right?: Landmark[];
}

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export interface HandTracker {
  video: HTMLVideoElement;
  detect: (timestampMs: number) => HandsResult;
}

export interface HandTrackerOptions {
  /**
   * The webcam preview is mirrored for user comfort, which flips MediaPipe's
   * handedness labels relative to what the user perceives. Swapping corrects
   * "raise your right hand" to actually map to the Right bucket.
   */
  swapHandedness?: boolean;
}

export async function createHandTracker(
  options: HandTrackerOptions = {},
): Promise<HandTracker> {
  const { swapHandedness = true } = options;

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      window.isSecureContext
        ? "This browser does not expose a camera API."
        : "Camera needs a secure context. Open http://localhost:5173 (not the Network IP address).",
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (name === "NotAllowedError") {
      throw new Error("Camera permission was denied. Allow it in the browser and retry.");
    }
    if (name === "NotFoundError") {
      throw new Error("No camera was found on this device.");
    }
    if (name === "NotReadableError") {
      throw new Error("The camera is in use by another app. Close it and retry.");
    }
    throw err;
  }

  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  // Safari (and some autoplay policies) refuse to decode a video that is not
  // attached to the DOM. Keep it in the page but effectively invisible.
  video.setAttribute("playsinline", "");
  Object.assign(video.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "1px",
    height: "1px",
    opacity: "0.01",
    pointerEvents: "none",
    zIndex: "-1",
  });
  document.body.appendChild(video);
  video.srcObject = stream;

  await video.play().catch(() => {
    /* play() can reject spuriously; loadeddata below is the real gate */
  });

  // Wait until the stream actually produces sized frames, otherwise MediaPipe's
  // detectForVideo throws on a zero-dimension image.
  await new Promise<void>((resolve) => {
    const ready = () => video.videoWidth > 0 && video.videoHeight > 0;
    if (ready()) return resolve();
    const check = () => {
      if (ready()) {
        video.removeEventListener("loadeddata", check);
        resolve();
      }
    };
    video.addEventListener("loadeddata", check);
    // Fallback poll in case loadeddata already fired before listener attached.
    const poll = setInterval(() => {
      if (ready()) {
        clearInterval(poll);
        resolve();
      }
    }, 50);
  });

  const fileset = await FilesetResolver.forVisionTasks(WASM_CDN);
  const makeLandmarker = (delegate: "GPU" | "CPU") =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      numHands: 2,
    });

  let landmarker: HandLandmarker;
  try {
    landmarker = await makeLandmarker("GPU");
  } catch (err) {
    console.warn("GPU delegate unavailable, falling back to CPU", err);
    landmarker = await makeLandmarker("CPU");
  }

  let lastTimestamp = -1;

  function detect(timestampMs: number): HandsResult {
    const out: HandsResult = {};
    if (video.readyState < 2 || video.videoWidth === 0) return out;

    // detectForVideo requires strictly increasing timestamps.
    if (timestampMs <= lastTimestamp) {
      timestampMs = lastTimestamp + 1;
    }
    lastTimestamp = timestampMs;

    let raw;
    try {
      raw = landmarker.detectForVideo(video, timestampMs);
    } catch (err) {
      console.warn("hand detection frame failed", err);
      return out;
    }

    for (let i = 0; i < raw.landmarks.length; i++) {
      const handedness = raw.handedness[i]?.[0]?.categoryName as HandLabel | undefined;
      if (!handedness) continue;
      const label: HandLabel = swapHandedness
        ? handedness === "Left"
          ? "Right"
          : "Left"
        : handedness;
      out[label] = raw.landmarks[i] as Landmark[];
    }

    return out;
  }

  return { video, detect };
}
