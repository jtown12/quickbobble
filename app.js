import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const canvas = document.getElementById("canvas");
const overlay = document.getElementById("overlay");
const uploadBtn = document.getElementById("upload-btn");
const cornerUpload = document.getElementById("corner-upload");
const motionBtn = document.getElementById("motion-btn");
const fileInput = document.getElementById("file-input");

// --- three.js setup ---

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0, 4);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(2, 3, 4);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x4488ff, 0.4);
rimLight.position.set(-3, 1, -2);
scene.add(rimLight);

// pivotGroup rotates around the object's base, like a bobble head spring mount
const pivotGroup = new THREE.Group();
scene.add(pivotGroup);
let model = null;

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- loading a GLB ---

const loader = new GLTFLoader();

function loadModel(file) {
  const url = URL.createObjectURL(file);
  loader.load(
    url,
    (gltf) => {
      if (model) pivotGroup.remove(model.parent);
      const loaded = gltf.scene;

      const box = new THREE.Box3().setFromObject(loaded);
      const size = new THREE.Vector3();
      box.getSize(size);
      const scale = 1.6 / Math.max(size.x, size.y, size.z, 0.0001);
      loaded.scale.setScalar(scale);

      const scaledBox = new THREE.Box3().setFromObject(loaded);
      const center = new THREE.Vector3();
      scaledBox.getCenter(center);
      loaded.position.x -= center.x;
      loaded.position.z -= center.z;
      loaded.position.y -= scaledBox.min.y;

      const innerGroup = new THREE.Group();
      innerGroup.add(loaded);
      pivotGroup.add(innerGroup);
      pivotGroup.position.y = -scaledBox.getSize(new THREE.Vector3()).y * 0.5;

      model = loaded;
      URL.revokeObjectURL(url);
      overlay.classList.add("hidden");
      cornerUpload.classList.remove("hidden");
      maybeShowMotionButton();
    },
    undefined,
    (err) => {
      console.error(err);
      alert("Couldn't load that GLB.");
    }
  );
}

uploadBtn.addEventListener("click", () => fileInput.click());
cornerUpload.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) loadModel(file);
});

const DEFAULT_MODEL_URL = "./model.glb";
fetch(DEFAULT_MODEL_URL)
  .then((res) => res.blob())
  .then((blob) => loadModel(blob))
  .catch(() => {});

// --- device motion -> bobble physics ---

const SPRING_K = 90; // stiffness
const DAMPING = 6; // resistance
const FORCE_SCALE = 0.02;
const MAX_ANGLE = 0.5;

let angleX = 0, angleZ = 0; // pitch (nod), roll (tilt)
let velX = 0, velZ = 0;

function onDeviceMotion(event) {
  const acc = event.acceleration || event.accelerationIncludingGravity;
  if (!acc) return;
  const ax = acc.x || 0;
  const ay = acc.y || 0;
  velZ += ax * FORCE_SCALE;
  velX += -ay * FORCE_SCALE;
}

function needsMotionPermission() {
  return typeof DeviceMotionEvent !== "undefined" &&
    typeof DeviceMotionEvent.requestPermission === "function";
}

function startMotion() {
  window.addEventListener("devicemotion", onDeviceMotion);
  motionBtn.style.display = "none";
}

function maybeShowMotionButton() {
  if (needsMotionPermission()) {
    motionBtn.style.display = "block";
  } else if (typeof DeviceMotionEvent !== "undefined") {
    startMotion();
  }
}

motionBtn.addEventListener("click", async () => {
  try {
    const result = await DeviceMotionEvent.requestPermission();
    if (result === "granted") startMotion();
  } catch (err) {
    console.error(err);
  }
});

// --- simulated motion buttons ---

const TURN_STRENGTH = 3;
const ACCEL_STRENGTH = 3;
const BUMPY_STRENGTH = 3;

document.getElementById("btn-left").addEventListener("click", () => { velZ += TURN_STRENGTH; });
document.getElementById("btn-right").addEventListener("click", () => { velZ -= TURN_STRENGTH; });
document.getElementById("btn-gas").addEventListener("click", () => { velX += ACCEL_STRENGTH; });
document.getElementById("btn-brake").addEventListener("click", () => { velX -= ACCEL_STRENGTH; });

document.getElementById("btn-bumpy").addEventListener("click", () => {
  let ticks = 0;
  const interval = setInterval(() => {
    velX += (Math.random() - 0.5) * BUMPY_STRENGTH;
    velZ += (Math.random() - 0.5) * BUMPY_STRENGTH;
    if (++ticks >= 10) clearInterval(interval);
  }, 90);
});

// --- animation loop ---

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  velX += (-SPRING_K * angleX - DAMPING * velX) * dt;
  velZ += (-SPRING_K * angleZ - DAMPING * velZ) * dt;
  angleX += velX * dt;
  angleZ += velZ * dt;
  angleX = THREE.MathUtils.clamp(angleX, -MAX_ANGLE, MAX_ANGLE);
  angleZ = THREE.MathUtils.clamp(angleZ, -MAX_ANGLE, MAX_ANGLE);

  pivotGroup.rotation.x = angleX;
  pivotGroup.rotation.z = angleZ;

  renderer.render(scene, camera);
}

animate();
