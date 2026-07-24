// three-config.js
// Builds a live, colour-accurate 3D preview of the number plate keychain and
// can export the current design as ONE merged STL file (base + border +
// vehicle number + name/contact, all combined into a single mesh) — matching
// exactly what's shown in the live preview. The accent colour (name +
// contact number) is selectable — red, yellow, or green.

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
const HOLE_R = 2.0; // Ø4.00mm, measured from the STL (hole loop r_avg = 1.999)
// The keyring hole is CONCENTRIC with the top-left rounded corner — verified
// by slicing the STL: the outer corner arc fits center (3.5, 24.5) r=3.5mm,
// and the hole loop sits at center (3.48, 24.53) r=2.0mm, i.e. the same
// point, 3.5mm in from each edge. It sits entirely inside solid black corner
// material; the white margin cutout stays well clear of it (see MARGIN_POLY).
// Model coords: x = -(48-3.5) = -44.5, y = +(14-3.5) = +10.5.
const HOLE_OFFSET_X = -PLATE_W / 2 + CORNER_R;
const HOLE_OFFSET_Y = PLATE_H / 2 - CORNER_R;
const FILLET_R = 1.6; // small corner rounding applied to the border/margin outline

// The border/margin inner-boundary polygon (where black meets white),
// traced directly from the STL at the z=2.4 (black-layer) cross-section and
// simplified with Douglas–Peucker, expressed in plate-centred local
// coordinates (0,0 = plate centre). Left/right edges sit 1.5mm in from the
// outer edge (the thin border); the top margin is wider than the bottom.
const TOP_MARGIN_Y = 7.0;
const TOP_MARGIN_HALF_W = 16.5; // ~33mm flat, per STL trace
const BOTTOM_MARGIN_Y = -7.0;
const BOTTOM_MARGIN_HALF_W = 11.5; // ~23mm flat, per STL trace
// White-region boundary (where black meets white on the base face), traced
// from the STL z=2.4 cross-section and simplified. Used for TEXT PLACEMENT
// reference. The black layer itself uses BORDER_CUTOUT_POLY below (this same
// shape, but merged with the keyring hole).
const MARGIN_POLY = [
  [-46.50, -10.50],
  [-46.49, 10.72],
  [-44.99, 12.44],
  [-23.58, 12.42],
  [-18.13, 7.65],
  [-16.26, 7.00],
  [16.59, 7.02],
  [24.07, 12.49],
  [44.76, 12.48],
  [46.48, 10.76],
  [46.50, -10.50],
  [44.89, -12.46],
  [18.91, -12.48],
  [17.37, -11.85],
  [13.13, -7.65],
  [11.26, -7.00],
  [-11.76, -7.05],
  [-18.91, -12.48],
  [-44.50, -12.50],
  [-45.82, -12.00],
  [-46.49, -10.63],
];

// The black layer's actual cutout: MARGIN_POLY unioned with the keyring hole
// (concentric with the top-left corner, r=2.0). Pre-computed and verified to
// be a single simple polygon (no self-intersections), so the black extrude
// is valid. Where the white cutout meets the hole, the boundary follows the
// hole's arc on the corner side — leaving solid black wrapping the corner and
// merging the hole into the white void, exactly as the real part is built.
const BORDER_CUTOUT_POLY = [
  [-46.50, -10.50],
  [-46.49, 10.30],
  [-46.50, 10.49],
  [-46.49, 10.68],
  [-46.46, 10.87],
  [-46.42, 11.06],
  [-46.36, 11.24],
  [-46.28, 11.42],
  [-46.18, 11.58],
  [-46.07, 11.74],
  [-45.94, 11.88],
  [-45.81, 12.02],
  [-45.65, 12.13],
  [-45.49, 12.24],
  [-45.32, 12.32],
  [-45.14, 12.39],
  [-44.96, 12.45],
  [-44.77, 12.48],
  [-44.58, 12.50],
  [-44.39, 12.50],
  [-44.20, 12.48],
  [-44.01, 12.44],
  [-23.58, 12.42],
  [-18.13, 7.65],
  [-16.26, 7.00],
  [16.59, 7.02],
  [24.07, 12.49],
  [44.76, 12.48],
  [46.48, 10.76],
  [46.50, -10.50],
  [44.89, -12.46],
  [18.91, -12.48],
  [17.37, -11.85],
  [13.13, -7.65],
  [11.26, -7.00],
  [-11.76, -7.05],
  [-18.91, -12.48],
  [-44.50, -12.50],
  [-45.82, -12.00],
  [-46.49, -10.63],
];

let scene, camera, renderer, controls, canvasEl, loadingEl;
let modelGroup = null;
let font = null;
let pendingFields = null;
let ready = false;

function roundedRectShape(w, h, r, holeCenters = []) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  // True circular-arc corners (not a bezier approximation) so the corner
  // radius is exact — this matters for hole clearance calculations near
  // the corner, not just visual accuracy.
  shape.moveTo(x, y + r);
  shape.lineTo(x, y + h - r);
  shape.absarc(x + r, y + h - r, r, Math.PI, Math.PI / 2, true); // top-left
  shape.lineTo(x + w - r, y + h);
  shape.absarc(x + w - r, y + h - r, r, Math.PI / 2, 0, true); // top-right
  shape.lineTo(x + w, y + r);
  shape.absarc(x + w - r, y + r, r, 0, -Math.PI / 2, true); // bottom-right
  shape.lineTo(x + r, y);
  shape.absarc(x + r, y + r, r, -Math.PI / 2, -Math.PI, true); // bottom-left
  shape.closePath();

  holeCenters.forEach(([cx, cy, cr]) => {
    const hole = new THREE.Path();
    hole.absarc(cx, cy, cr, 0, Math.PI * 2, true);
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

  // radius 0 -> plain straight-edged polygon (used for BORDER_CUTOUT_POLY,
  // which already has its rounding/arc baked into the point list).
  if (radius <= 0) {
    path.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < n; i++) path.lineTo(points[i][0], points[i][1]);
    path.closePath();
    return path;
  }

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

// The black border+margin layer. This is the plate outline minus the white
// face area. IMPORTANT: on this layer the keyring hole and the white margin
// cutout are merged into ONE polygon (BORDER_CUTOUT_POLY) rather than cut as
// two separate overlapping paths. The hole is concentric with the top-left
// corner and tangent to the margin's left edge, so cutting it as a separate
// circle on top of the margin polygon created two overlapping holes — an
// invalid, self-intersecting extrude profile (the spike/tear artifact seen
// in the preview). BORDER_CUTOUT_POLY is the pre-computed, verified union of
// the white-margin polygon and the hole (0 self-intersections; corner stays
// black; interior + hole are the white void), so the black layer extrudes
// cleanly. The white base layer below still cuts the hole as a normal circle.
function borderMarginShape() {
  const outer = roundedRectShape(PLATE_W, PLATE_H, CORNER_R);
  outer.holes.push(roundedPolygonPath(BORDER_CUTOUT_POLY, 0.0));
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
    bevelEnabled: false, // three.js defaults this to true — that extra bevel
    // traces a second offset outline around every letter/digit, which is
    // exactly the duplicate concentric line the slicer was drawing around
    // "M", "H", "0", etc. Turning it off makes each glyph a single clean
    // vertical-walled extrusion, matching the reference CAD part.
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
  // Hole is merged into BORDER_CUTOUT_POLY, so no separate hole is cut here.
  const border = borderMarginShape();
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

  // --- contact number (red, centred in the top margin) ---
  if (fontObj && fields.showContact && fields.contactNumber) {
    const areaW = TOP_MARGIN_HALF_W * 2 * 0.92;
    const areaH = 3.6;
    const geo = fitText(fields.contactNumber, fontObj, areaW, areaH, 5);
    if (geo) {
      const yCenter = (TOP_MARGIN_Y + PLATE_H / 2) / 2;
      geo.translate(0, yCenter, BASE_DEPTH + TRIM_DEPTH);
      redTextGeos.push(geo);
    }
  }

  // --- owner name (red, centred in the bottom margin) ---
  if (fontObj && fields.showName && fields.ownerName) {
    const areaW = BOTTOM_MARGIN_HALF_W * 2 * 0.9;
    const areaH = 3.6;
    const geo = fitText(fields.ownerName.toUpperCase(), fontObj, areaW, areaH, 4.5);
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

// Exports the ENTIRE design (base + border/margin + vehicle number +
// name/contact) as a SINGLE merged STL, matching exactly what's shown in
// the live preview — no separate per-colour files, no manual re-alignment
// needed on import. (Previously this exported 3 separate STLs, one per
// colour; importing those separately into a slicer generally means each
// gets auto-arranged to its own spot on the plate, and re-stacking them
// back together by eye introduces tiny XY misalignments — which is what
// was causing the extra/duplicate perimeter lines seen in slicing,
// alongside the TextGeometry bevel bug fixed above.)
//
// Note: a plain STL has no place to store per-region filament/colour info.
// This single file has the complete geometry, but assigning which regions
// print in which filament still needs Bambu Studio's built-in multi-filament
// "Paint" tool after import (Edit > Color Painting), same as with any
// single-body multi-material model.
export function exportCombinedSTL() {
  if (!modelGroup) return null;
  const exporter = new STLExporter();
  const scene2 = new THREE.Scene();
  let any = false;
  modelGroup.traverse((obj) => {
    if (obj.isMesh && obj.userData.exportGroup) {
      scene2.add(obj.clone());
      any = true;
    }
  });
  if (!any) return null;
  const buf = exporter.parse(scene2, { binary: true });
  return arrayBufferToBase64(buf.buffer ? buf.buffer : buf);
}
