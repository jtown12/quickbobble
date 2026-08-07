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

const camera = new THREE.PerspectiveCamera(
  40,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0, 4);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
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
let pivotBaseY = 0;

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
      pivotBaseY = -scaledBox.getSize(new THREE.Vector3()).y * 0.5;
      pivotGroup.position.y = pivotBaseY;

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

const SPRING_K = 90; // tilt stiffness
const DAMPING = 6; // tilt resistance
const YAW_SPRING_K = 60; // spin stiffness (softer, spins further before recoiling)
const YAW_DAMPING = 5;
const BOUNCE_SPRING_K = 140; // bounce stiffness (snappier, like a shorter spring)
const BOUNCE_DAMPING = 10;

const ACCEL_SCALE = 0.02; // linear acceleration -> tilt/bounce kick
const GYRO_SCALE = 0.006; // rotation rate (deg/s) -> tilt/spin kick

const MAX_ANGLE = 0.5;
const MAX_YAW = 0.7;
const MAX_BOUNCE = 0.2;

let angleX = 0, angleZ = 0, angleY = 0; // pitch (nod), roll (tilt), yaw (spin)
let velX = 0, velZ = 0, velY = 0;
let bounceY = 0, velBounceY = 0; // vertical hop

function onDeviceMotion(event) {
  const acc = event.acceleration || event.accelerationIncludingGravity;
  if (acc) {
    const ax = acc.x || 0; // left-right
    const ay = acc.y || 0; // forward-back
    const az = acc.z || 0; // up-down
    velZ += ax * ACCEL_SCALE;
    velX += -ay * ACCEL_SCALE;
    velBounceY += az * ACCEL_SCALE;
  }

  // rotationRate axis-to-motion mapping is empirically tuned against real
  // device behavior (it didn't match the on-paper geometry -- nod gestures
  // read as gamma and roll gestures read as beta on the phones this was
  // tested on, not the reverse).
  const rot = event.rotationRate;
  if (rot) {
    const beta = rot.beta || 0; // roll rate -> roll
    const gamma = rot.gamma || 0; // nod rate -> pitch
    const alpha = rot.alpha || 0; // spin rate -> yaw
    velX += gamma * GYRO_SCALE;
    velZ += beta * GYRO_SCALE;
    velY += alpha * GYRO_SCALE;
  }
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
    velY += (Math.random() - 0.5) * BUMPY_STRENGTH;
    velBounceY += (Math.random() - 0.5) * BUMPY_STRENGTH * 0.3;
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
  velY += (-YAW_SPRING_K * angleY - YAW_DAMPING * velY) * dt;
  velBounceY += (-BOUNCE_SPRING_K * bounceY - BOUNCE_DAMPING * velBounceY) * dt;

  angleX += velX * dt;
  angleZ += velZ * dt;
  angleY += velY * dt;
  bounceY += velBounceY * dt;

  angleX = THREE.MathUtils.clamp(angleX, -MAX_ANGLE, MAX_ANGLE);
  angleZ = THREE.MathUtils.clamp(angleZ, -MAX_ANGLE, MAX_ANGLE);
  angleY = THREE.MathUtils.clamp(angleY, -MAX_YAW, MAX_YAW);
  bounceY = THREE.MathUtils.clamp(bounceY, -MAX_BOUNCE, MAX_BOUNCE);

  pivotGroup.rotation.x = angleX;
  pivotGroup.rotation.y = angleY;
  pivotGroup.rotation.z = angleZ;
  pivotGroup.position.y = pivotBaseY + bounceY;

  renderer.render(scene, camera);
}

animate();
