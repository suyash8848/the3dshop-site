// three-config.js
// Builds a live, colour-accurate 3D preview of the number plate keychain and
// can export the current design as three STL files (white / black / accent) —
// one per print colour, matching the real 3-colour print workflow. The
// accent colour (name + contact number) is selectable — red, yellow, or green.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { STLExporter } from "three/addons/exporters/STLExporter.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const COLORS = {
  white: 0xf2f2ef,
  black: 0x161616,
};

// Selectable name/contact accent colours (swatches in the form map to these).
const ACCENT_COLORS = {
  red: 0xc8102e,
  yellow: 0xe8b400,
  green: 0x2f9e44,
};

// Plate geometry constants, in millimetres — updated to match the supplied
// engineering drawing exactly: 96 x 28mm footprint, 3.5mm outer corner
// radius (confirmed by direct CAD measurement), Ø4.00mm keyring hole
// (2.00mm radius, also confirmed by CAD measurement), 1.50mm thin
// perimeter border, 7.00mm deep top/bottom margins with a 35.00mm-wide
// flat top margin and 25.00mm-wide flat bottom margin (asymmetric —
// matches the drawing), joined to the thin border by 45°/135° chamfers.
// Vehicle number text targets a 10mm bounding height (drawing's "5.00"
// half-height dimension).
const PLATE_W = 96;
const PLATE_H = 28;
const CORNER_R = 3.5; // confirmed by direct CAD measurement (outer plate corner)
const THIN_BORDER = 1.5; // perimeter border width away from the top/bottom margins
const BASE_DEPTH = 2.0;
const TRIM_DEPTH = 0.8; // border + margin height above base (2.0 -> 2.8)
const TEXT_DEPTH = 0.4; // number text height above base (2.8 -> 3.2)
const NAME_TEXT_DEPTH = 0.4; // name/contact text height above the margin
const HOLE_R = 2.0; // Ø4.00mm per drawing
const HOLE_OFFSET_X = -PLATE_W / 2 + 3.5;
const HOLE_OFFSET_Y = PLATE_H / 2 - 3.5;
const FILLET_R = 1.6; // small corner rounding applied to the border/margin outline

// The border/margin inner-boundary polygon (where black meets white), in
// plate-centred local coordinates (0,0 = plate centre). Flat-segment
// half-widths and margin depth come directly from the drawing; the chamfer/
// shoulder points (not individually dimensioned there) keep the same
// proportions traced from the real STL.
const TOP_MARGIN_Y = 7.0;
const TOP_MARGIN_HALF_W = 17.5; // 35.00mm wide, per drawing
const BOTTOM_MARGIN_Y = -7.0;
const BOTTOM_MARGIN_HALF_W = 12.5; // 25.00mm wide, per drawing
const MARGIN_POLY = [
  [44.6, 12.5],    // top-right: shoulder near corner
  [23.9, 12.5],    // top-right: chamfer start
  [TOP_MARGIN_HALF_W, TOP_MARGIN_Y],   // top flat, right end
  [-TOP_MARGIN_HALF_W, TOP_MARGIN_Y],  // top flat, left end
  [-23.9, 12.5],   // top-left: chamfer end
  [-44.6, 12.5],   // top-left: shoulder near corner
  [-46.5, 10.64],  // left edge, top
  [-46.5, -10.64], // left edge, bottom
  [-44.6, -12.5],  // bottom-left: shoulder near corner
  [-18.9, -12.5],  // bottom-left: chamfer start
  [-BOTTOM_MARGIN_HALF_W, BOTTOM_MARGIN_Y], // bottom flat, left end
  [BOTTOM_MARGIN_HALF_W, BOTTOM_MARGIN_Y],  // bottom flat, right end
  [18.9, -12.5],   // bottom-right: chamfer end
  [44.6, -12.5],   // bottom-right: shoulder near corner
  [46.5, -10.64],  // right edge, bottom
  [46.5, 10.64],   // right edge, top
];

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

// Builds a THREE.Path/Shape tracing `points` (closed polygon) with a small
// fillet radius at every vertex, so the traced margin outline isn't razor-
// sharp at each joint.
function roundedPolygonPath(points, radius, PathClass = THREE.Path) {
  const n = points.length;
  const path = new PathClass();
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];

    const toPrev = [prev[0] - curr[0], prev[1] - curr[1]];
    const toNext = [next[0] - curr[0], next[1] - curr[1]];
    const lenPrev = Math.hypot(...toPrev);
    const lenNext = Math.hypot(...toNext);
    const r = Math.min(radius, lenPrev * 0.4, lenNext * 0.4);

    const pA = [curr[0] + (toPrev[0] / lenPrev) * r, curr[1] + (toPrev[1] / lenPrev) * r];
    const pB = [curr[0] + (toNext[0] / lenNext) * r, curr[1] + (toNext[1] / lenNext) * r];

    if (i === 0) path.moveTo(pA[0], pA[1]);
    else path.lineTo(pA[0], pA[1]);
    path.quadraticCurveTo(curr[0], curr[1], pB[0], pB[1]);
  }
  path.closePath();
  return path;
}

// The black border+margin layer: plate outer outline, minus the traced
// margin polygon (which becomes white/face), minus the keyring hole.
function borderMarginShape(holeCenters = []) {
  const outer = roundedRectShape(PLATE_W, PLATE_H, CORNER_R, holeCenters);
  const innerHole = roundedPolygonPath(MARGIN_POLY, FILLET_R);
  outer.holes.push(innerHole);
  return outer;
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

  // --- border + top/bottom margins (black) ---
  const border = borderMarginShape(holeCenters);
  const borderGeo = extrude(border, TRIM_DEPTH);
  borderGeo.translate(0, 0, BASE_DEPTH);
  const blackMat = new THREE.MeshStandardMaterial({ color: COLORS.black, roughness: 0.5, metalness: 0.05 });
  const borderMesh = new THREE.Mesh(borderGeo, blackMat);
  borderMesh.userData.exportGroup = "black";
  group.add(borderMesh);

  const blackTextGeos = [];
  const redTextGeos = [];

  // --- vehicle number (black, spans nearly the full width, centred) ---
  if (fontObj && fields.vehicleNumber) {
    const areaW = PLATE_W - 9;
    const areaH = 10; // matches the drawing's 5.00mm half-height dimension
    const geo = fitText(fields.vehicleNumber.toUpperCase(), fontObj, areaW, areaH, 8);
    if (geo) {
      geo.translate(0, 0, BASE_DEPTH);
      blackTextGeos.push(geo);
    }
  }

  // --- owner name (red, centred in the top margin) ---
  if (fontObj && fields.showName && fields.ownerName) {
    const areaW = TOP_MARGIN_HALF_W * 2 * 0.92;
    const areaH = 3.6;
    const geo = fitText(fields.ownerName.toUpperCase(), fontObj, areaW, areaH, 5);
    if (geo) {
      const yCenter = (TOP_MARGIN_Y + PLATE_H / 2) / 2;
      geo.translate(0, yCenter, BASE_DEPTH + TRIM_DEPTH);
      redTextGeos.push(geo);
    }
  }

  // --- contact number (red, centred in the bottom margin) ---
  if (fontObj && fields.showContact && fields.contactNumber) {
    const areaW = BOTTOM_MARGIN_HALF_W * 2 * 0.9;
    const areaH = 3.6;
    const geo = fitText(fields.contactNumber, fontObj, areaW, areaH, 4.5);
    if (geo) {
      const yCenter = -(Math.abs(BOTTOM_MARGIN_Y) + PLATE_H / 2) / 2;
      geo.translate(0, yCenter, BASE_DEPTH + TRIM_DEPTH);
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
    const accentHex = ACCENT_COLORS[fields.accentColor] || ACCENT_COLORS.red;
    const accentMat = new THREE.MeshStandardMaterial({ color: accentHex, roughness: 0.45, metalness: 0.05 });
    const mesh = new THREE.Mesh(merged, accentMat);
    mesh.userData.exportGroup = "accent";
    group.add(mesh);
  }

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
  const groups = { white: [], black: [], accent: [] };

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
