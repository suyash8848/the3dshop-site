// three-config.js
// Builds a live, colour-accurate 3D preview of the number plate keychain and
// can export the current design as three STL files (white / black / red) —
// one per print colour, matching the real 3-colour print workflow.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const COLORS = {
  white: 0xf2f2ef,
  black: 0x161616,
  red: 0xc8102e,
  silver: 0xc9cdd1,
};

// Plate geometry constants, in millimetres — measured directly from the
// supplied number_plate.step (bounding box + layer-height histogram of its
// CARTESIAN_POINT data): 96 x 28mm footprint, 3.2mm total thickness, a
// 3.5mm outer corner radius, and a 3-step layer stack (0→2.0 base white,
// 2.0→2.8 border/ribbon black, 2.8→3.2 text).
const PLATE_W = 96;
const PLATE_H = 28;
const CORNER_R = 3.5;
const BORDER_W = 4.0;
const BASE_DEPTH = 2.0;
const TRIM_DEPTH = 0.8; // border + ribbon height above base (2.0 -> 2.8)
const TEXT_DEPTH = 0.4; // number text height above base (2.8 -> 3.2)
const NAME_TEXT_DEPTH = 0.4; // name/contact text height above ribbon
const HOLE_R = 2.0;
const HOLE_OFFSET_X = -PLATE_W / 2 + 3.5;
const HOLE_OFFSET_Y = PLATE_H / 2 - 3.5;
const RIBBON_FRACTION = 0.36; // portion of plate width used by the name/contact ribbon

let scene, camera, renderer, controls, canvasEl, loadingEl;
let modelGroup = null;
let font = null;
let pendingFields = null;
let ready = false;

function roundedRectShape(w, h, r, holeCenters = []) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x, y + r);
  shape.lineTo(x, y + h - r);
  shape.quadraticCurveTo(x, y + h, x + r, y + h);
  shape.lineTo(x + w - r, y + h);
  shape.quadraticCurveTo(x + w, y + h, x + w, y + h - r);
  shape.lineTo(x + w, y + r);
  shape.quadraticCurveTo(x + w, y, x + w - r, y);
  shape.lineTo(x + r, y);
  shape.quadraticCurveTo(x, y, x, y + r);

  holeCenters.forEach(([cx, cy, cr]) => {
    const hole = new THREE.Path();
    hole.absellipse(cx, cy, cr, cr, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  });
  return shape;
}

function frameShape(w, h, r, border, holeCenters = []) {
  const outer = roundedRectShape(w, h, r, holeCenters);
  const inner = roundedRectShape(w - border * 2, h - border * 2, Math.max(r - border, 0.6));
  outer.holes.push(new THREE.Path(inner.getPoints(24)));
  return outer;
}

function ribbonShape(w, h, r, fraction) {
  // A skewed parallelogram covering the right-hand `fraction` of the plate,
  // inset from the border, matching the black name/contact panel in the
  // reference photos.
  const rw = w * fraction;
  const x0 = w / 2 - rw - BORDER_W * 1.4;
  const x1 = w / 2 - BORDER_W * 1.4;
  const y0 = -h / 2 + BORDER_W * 1.4;
  const y1 = h / 2 - BORDER_W * 1.4;
  const skew = h * 0.28;
  const shape = new THREE.Shape();
  shape.moveTo(x0 + skew, y0);
  shape.lineTo(x1, y0);
  shape.lineTo(x1 - skew, y1);
  shape.lineTo(x0, y1);
  shape.closePath();
  return shape;
}

function extrude(shape, depth, bevel = false) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel,
    bevelThickness: 0.15,
    bevelSize: 0.15,
    bevelSegments: 2,
    curveSegments: 16,
  });
  return geo;
}

function fitText(str, font, maxWidth, maxHeight, sizeGuess) {
  if (!str) return null;
  const geo = new TextGeometry(str, {
    font,
    size: sizeGuess,
    height: 1,
    curveSegments: 6,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const w = bb.max.x - bb.min.x;
  const h = bb.max.y - bb.min.y;
  const scale = Math.min(maxWidth / w, maxHeight / h, 1.6);
  geo.translate(-(bb.max.x + bb.min.x) / 2, -(bb.max.y + bb.min.y) / 2, 0);
  geo.scale(scale, scale, 1);
  return geo;
}

function buildKeychainGroup(fields, fontObj) {
  const group = new THREE.Group();
  const holeCenters = [[HOLE_OFFSET_X, HOLE_OFFSET_Y, HOLE_R]];

  // --- base plate (white) ---
  const baseShape = roundedRectShape(PLATE_W, PLATE_H, CORNER_R, holeCenters);
  const baseGeo = extrude(baseShape, BASE_DEPTH);
  const baseMat = new THREE.MeshStandardMaterial({ color: COLORS.white, roughness: 0.55, metalness: 0.02 });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.userData.exportGroup = "white";
  group.add(baseMesh);

  // --- border frame (black) ---
  const frame = frameShape(PLATE_W, PLATE_H, CORNER_R, BORDER_W, holeCenters);
  const frameGeo = extrude(frame, TRIM_DEPTH);
  frameGeo.translate(0, 0, BASE_DEPTH);
  const blackMat = new THREE.MeshStandardMaterial({ color: COLORS.black, roughness: 0.5, metalness: 0.05 });
  const frameMesh = new THREE.Mesh(frameGeo, blackMat);
  frameMesh.userData.exportGroup = "black";
  group.add(frameMesh);

  // --- ribbon (black) ---
  const ribbon = ribbonShape(PLATE_W, PLATE_H, CORNER_R, RIBBON_FRACTION);
  const ribbonGeo = extrude(ribbon, TRIM_DEPTH);
  ribbonGeo.translate(0, 0, BASE_DEPTH);
  const ribbonMesh = new THREE.Mesh(ribbonGeo, blackMat);
  ribbonMesh.userData.exportGroup = "black";
  group.add(ribbonMesh);

  const blackTextGeos = [];
  const redTextGeos = [];

  // --- vehicle number (black, on the white face) ---
  if (fontObj && fields.vehicleNumber) {
    const areaW = PLATE_W * (1 - RIBBON_FRACTION) - BORDER_W * 4;
    const areaH = PLATE_H - BORDER_W * 3.4;
    const geo = fitText(fields.vehicleNumber.toUpperCase(), fontObj, areaW, areaH, 8);
    if (geo) {
      geo.translate(-PLATE_W * RIBBON_FRACTION * 0.55, 0, BASE_DEPTH);
      blackTextGeos.push(geo);
    }
  }

  // --- owner name (red, on ribbon) ---
  if (fontObj && fields.showName && fields.ownerName) {
    const areaW = PLATE_W * RIBBON_FRACTION - BORDER_W * 2;
    const geo = fitText(fields.ownerName.toUpperCase(), fontObj, areaW, PLATE_H * 0.32, 5);
    if (geo) {
      geo.translate(PLATE_W * (0.5 - RIBBON_FRACTION / 2) - BORDER_W * 1.4, PLATE_H * 0.16, BASE_DEPTH + TRIM_DEPTH);
      redTextGeos.push(geo);
    }
  }

  // --- contact number (red, on ribbon) ---
  if (fontObj && fields.showContact && fields.contactNumber) {
    const areaW = PLATE_W * RIBBON_FRACTION - BORDER_W * 2;
    const geo = fitText(fields.contactNumber, fontObj, areaW, PLATE_H * 0.28, 4.5);
    if (geo) {
      geo.translate(PLATE_W * (0.5 - RIBBON_FRACTION / 2) - BORDER_W * 1.4, -PLATE_H * 0.18, BASE_DEPTH + TRIM_DEPTH);
      redTextGeos.push(geo);
    }
  }

  if (blackTextGeos.length) {
    const merged = blackTextGeos.length > 1 ? mergeGeometries(blackTextGeos) : blackTextGeos[0];
    const mesh = new THREE.Mesh(merged, blackMat);
    mesh.userData.exportGroup = "black";
    group.add(mesh);
  }
  if (redTextGeos.length) {
    const merged = redTextGeos.length > 1 ? mergeGeometries(redTextGeos) : redTextGeos[0];
    const redMat = new THREE.MeshStandardMaterial({ color: COLORS.red, roughness: 0.45, metalness: 0.05 });
    const mesh = new THREE.Mesh(merged, redMat);
    mesh.userData.exportGroup = "red";
    group.add(mesh);
  }

  // --- keyring ---
  const ringGeo = new THREE.TorusGeometry(4.4, 0.55, 10, 40);
  const ringMat = new THREE.MeshStandardMaterial({ color: COLORS.silver, roughness: 0.25, metalness: 0.85 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(HOLE_OFFSET_X, PLATE_H / 2 + 3.2, BASE_DEPTH / 2);
  ring.userData.exportGroup = null; // decorative only, not part of the printed file
  group.add(ring);

  group.rotation.x = -Math.PI / 2.35;
  group.position.z = -1;
  return group;
}

function disposeGroup(group) {
  if (!group) return;
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
  });
}

function rebuild(fields) {
  if (!scene) { pendingFields = fields; return; }
  const newGroup = buildKeychainGroup(fields, font);
  if (modelGroup) {
    scene.remove(modelGroup);
    disposeGroup(modelGroup);
  }
  modelGroup = newGroup;
  scene.add(modelGroup);
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function onResize() {
  if (!renderer || !camera || !canvasEl) return;
  const rect = canvasEl.parentElement.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}

export function initViewer(canvas, loadingElement) {
  canvasEl = canvas;
  loadingEl = loadingElement;

  scene = new THREE.Scene();
  scene.background = null;

  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 1000);
  camera.position.set(0, 46, 78);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  onResize();

  const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3a3d, 1.1);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(40, 60, 50);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(-50, 20, -30);
  scene.add(fill);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 40;
  controls.maxDistance = 140;
  controls.minPolarAngle = Math.PI * 0.15;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.target.set(0, 0, 0);

  window.addEventListener("resize", onResize);

  const loader = new FontLoader();
  loader.load(
    // Clean, neutral sans-serif (Droid Sans Bold) — swap this URL for a
    // converted version of your exact licensed font if you have one; see
    // README-DEPLOY.md for how to convert a .ttf to the typeface.json
    // format this loader expects.
    "https://cdn.jsdelivr.net/npm/three@0.160.1/examples/fonts/droid/droid_sans_bold.typeface.json",
    (loadedFont) => {
      font = loadedFont;
      ready = true;
      rebuild(pendingFields || { vehicleNumber: "MH 12 AB 3456", showName: false, showContact: false });
      if (loadingEl) loadingEl.classList.add("is-hidden");
      animate();
    },
    undefined,
    () => {
      if (loadingEl) loadingEl.textContent = "Preview unavailable — check your connection.";
    }
  );
}

export function updateModel(fields) {
  rebuild(fields);
}

export function isReady() {
  return ready;
}

// ---- STL export: one file per print colour ----
function arrayBufferToBase64(buf) {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function exportSTLByColor() {
  if (!modelGroup) return null;
  const exporter = new STLExporter();
  const groups = { white: [], black: [], red: [] };

  modelGroup.traverse((obj) => {
    if (obj.isMesh && obj.userData.exportGroup) {
      groups[obj.userData.exportGroup].push(obj);
    }
  });

  const out = {};
  Object.entries(groups).forEach(([color, meshes]) => {
    if (!meshes.length) { out[color] = null; return; }
    const scene2 = new THREE.Scene();
    meshes.forEach((m) => scene2.add(m.clone()));
    const buf = exporter.parse(scene2, { binary: true });
    out[color] = arrayBufferToBase64(buf.buffer ? buf.buffer : buf);
  });
  return out;
}
