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
const VERTICAL_OFFSET = 0.3; // shifts the model up on screen

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
      pivotBaseY = -scaledBox.getSize(new THREE.Vector3()).y * 0.5 + VERTICAL_OFFSET;
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

const params = {
  SPRING_K: 90, // tilt stiffness
  DAMPING: 6, // tilt resistance
  YAW_SPRING_K: 60, // spin stiffness (softer, spins further before recoiling)
  YAW_DAMPING: 5,
  BOUNCE_SPRING_K: 140, // bounce stiffness (snappier, like a shorter spring)
  BOUNCE_DAMPING: 10,
  ACCEL_SCALE: 0.02, // linear acceleration -> tilt/bounce kick
  GYRO_SCALE: 0.006, // rotation rate (deg/s) -> tilt/spin kick
  MAX_ANGLE: 0.5,
  MAX_YAW: 0.7,
  MAX_BOUNCE: 0.2,
};

let angleX = 0, angleZ = 0, angleY = 0; // pitch (nod), roll (tilt), yaw (spin)
let velX = 0, velZ = 0, velY = 0;
let bounceY = 0, velBounceY = 0; // vertical hop

function onDeviceMotion(event) {
  const acc = event.acceleration || event.accelerationIncludingGravity;
  if (acc) {
    const ax = acc.x || 0; // left-right
    const ay = acc.y || 0; // forward-back
    const az = acc.z || 0; // up-down
    velZ += ax * params.ACCEL_SCALE;
    velX += -ay * params.ACCEL_SCALE;
    velBounceY += az * params.ACCEL_SCALE;
  }

  // rotationRate axis-to-motion mapping is empirically tuned against real
  // device behavior (it didn't match the on-paper geometry -- nod gestures
  // read as alpha and spin gestures read as gamma on the phones this was
  // tested on, not the reverse).
  const rot = event.rotationRate;
  if (rot) {
    const beta = rot.beta || 0; // roll rate -> roll
    const gamma = rot.gamma || 0; // spin rate -> yaw
    const alpha = rot.alpha || 0; // nod rate -> pitch
    velX += alpha * GYRO_SCALE;
    velZ += beta * GYRO_SCALE;
    velY += gamma * GYRO_SCALE;
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

// --- settings panel ---

const settingsBtn = document.getElementById("settings-btn");
const settingsPanel = document.getElementById("settings-panel");
const settingsClose = document.getElementById("settings-close");
const settingsBody = document.getElementById("settings-body");
const settingsReset = document.getElementById("settings-reset");

const DEFAULT_PARAMS = { ...params };

settingsBtn.addEventListener("click", () => settingsPanel.classList.remove("hidden"));
settingsClose.addEventListener("click", () => settingsPanel.classList.add("hidden"));

const SETTINGS_CONFIG = [
  { key: "SPRING_K", label: "Tilt Stiffness", min: 20, max: 200, step: 5 },
  { key: "DAMPING", label: "Tilt Damping", min: 1, max: 20, step: 0.5 },
  { key: "YAW_SPRING_K", label: "Spin Stiffness", min: 20, max: 200, step: 5 },
  { key: "YAW_DAMPING", label: "Spin Damping", min: 1, max: 20, step: 0.5 },
  { key: "BOUNCE_SPRING_K", label: "Bounce Stiffness", min: 20, max: 300, step: 10 },
  { key: "BOUNCE_DAMPING", label: "Bounce Damping", min: 1, max: 30, step: 1 },
  { key: "ACCEL_SCALE", label: "Motion Sensitivity", min: 0.001, max: 0.1, step: 0.001 },
  { key: "GYRO_SCALE", label: "Rotation Sensitivity", min: 0.0005, max: 0.03, step: 0.0005 },
  { key: "MAX_ANGLE", label: "Max Tilt", min: 0.1, max: 1.2, step: 0.05, unit: "deg" },
  { key: "MAX_YAW", label: "Max Spin", min: 0.1, max: 1.57, step: 0.05, unit: "deg" },
  { key: "MAX_BOUNCE", label: "Max Bounce", min: 0.02, max: 0.6, step: 0.01 },
];

function toDisplay(value, cfg) {
  return cfg.unit === "deg" ? THREE.MathUtils.radToDeg(value) : value;
}

function toParam(value, cfg) {
  return cfg.unit === "deg" ? THREE.MathUtils.degToRad(value) : value;
}

function formatVal(value, cfg) {
  const decimals = cfg.step < 0.01 ? 4 : cfg.step < 0.1 ? 3 : cfg.step < 1 ? 2 : 0;
  return value.toFixed(decimals) + (cfg.unit === "deg" ? "°" : "");
}

const sliderRefs = [];

for (const cfg of SETTINGS_CONFIG) {
  const row = document.createElement("div");
  row.className = "setting-row";

  const label = document.createElement("label");
  const nameSpan = document.createElement("span");
  nameSpan.textContent = cfg.label;
  const valSpan = document.createElement("span");
  valSpan.className = "val";
  label.appendChild(nameSpan);
  label.appendChild(valSpan);
  row.appendChild(label);

  const input = document.createElement("input");
  input.type = "range";
  input.min = cfg.min;
  input.max = cfg.max;
  input.step = cfg.step;
  const displayValue = toDisplay(params[cfg.key], cfg);
  input.value = displayValue;
  valSpan.textContent = formatVal(displayValue, cfg);

  input.addEventListener("input", () => {
    const raw = parseFloat(input.value);
    params[cfg.key] = toParam(raw, cfg);
    valSpan.textContent = formatVal(raw, cfg);
  });

  row.appendChild(input);
  settingsBody.appendChild(row);
  sliderRefs.push({ cfg, input, valSpan });
}

settingsReset.addEventListener("click", () => {
  Object.assign(params, DEFAULT_PARAMS);
  for (const { cfg, input, valSpan } of sliderRefs) {
    const displayValue = toDisplay(params[cfg.key], cfg);
    input.value = displayValue;
    valSpan.textContent = formatVal(displayValue, cfg);
  }
});

// --- animation loop ---

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  velX += (-params.SPRING_K * angleX - params.DAMPING * velX) * dt;
  velZ += (-params.SPRING_K * angleZ - params.DAMPING * velZ) * dt;
  velY += (-params.YAW_SPRING_K * angleY - params.YAW_DAMPING * velY) * dt;
  velBounceY += (-params.BOUNCE_SPRING_K * bounceY - params.BOUNCE_DAMPING * velBounceY) * dt;

  angleX += velX * dt;
  angleZ += velZ * dt;
  angleY += velY * dt;
  bounceY += velBounceY * dt;

  angleX = THREE.MathUtils.clamp(angleX, -params.MAX_ANGLE, params.MAX_ANGLE);
  angleZ = THREE.MathUtils.clamp(angleZ, -params.MAX_ANGLE, params.MAX_ANGLE);
  angleY = THREE.MathUtils.clamp(angleY, -params.MAX_YAW, params.MAX_YAW);
  bounceY = THREE.MathUtils.clamp(bounceY, -params.MAX_BOUNCE, params.MAX_BOUNCE);

  pivotGroup.rotation.x = angleX;
  pivotGroup.rotation.y = angleY;
  pivotGroup.rotation.z = angleZ;
  pivotGroup.position.y = pivotBaseY + bounceY;

  renderer.render(scene, camera);
}

animate();
