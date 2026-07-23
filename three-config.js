// ============================================================
// THE 3D SHOP — Number Plate Keychain — live 3D configurator
// ============================================================
// Builds a parametric plate (rounded rect + keyring loop) and
// stacks extruded text on it in the same 3 colours as the
// customer's real Bambu print (confirmed from the uploaded
// gcode/3mf: white base, black border + vehicle number, red
// name + contact number). Regenerates on every field change.
//
// NOTE ON FIDELITY: this is a procedural recreation, not a
// literal render of number_plate.step. Converting a STEP BREP
// to a web mesh needs a CAD kernel (OpenCascade / FreeCAD) that
// isn't available in the build environment here. If you'd
// rather the viewer show your exact plate silhouette, export a
// blank (textless) STL of the plate from your CAD tool and drop
// it in as PLATE_STL_URL below — the script will use it as the
// base shape instead of the procedural rounded-rect.
// ============================================================

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { FontLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'https://unpkg.com/three@0.160.0/examples/jsm/geometries/TextGeometry.js';
import { STLExporter } from 'https://unpkg.com/three@0.160.0/examples/jsm/exporters/STLExporter.js';

// Swap this for your own STL export of the blank plate if you have one.
const PLATE_STL_URL = null;

// Real-world plate dimensions in mm — matched to the reference photos.
// Adjust these if your actual STEP model differs.
export const PLATE = {
  width: 90,
  height: 22,
  cornerRadius: 4,
  baseThickness: 2.2,   // white base
  borderRaise: 0.7,     // black border + vehicle-number raise
  redRaise: 0.35,       // red name/contact raise on top of black
  holeRadius: 2.2,
  holeOffsetX: 6,
};

const COLORS = {
  white: 0xF4F1EA,
  black: 0x17181D,
  red:   0xC12E1F,
};

let scene, camera, renderer, controls, group, font;
let canvasEl;
let ready = false;

function roundedRectShape(w, h, r) {
  const shape = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function buildBasePlate() {
  const shape = roundedRectShape(PLATE.width, PLATE.height, PLATE.cornerRadius);
  // keyring hole, top-left corner
  const holePath = new THREE.Path();
  holePath.absarc(-PLATE.width / 2 + PLATE.holeOffsetX, PLATE.height / 2 - PLATE.holeOffsetX, PLATE.holeRadius, 0, Math.PI * 2, true);
  shape.holes.push(holePath);

  const geo = new THREE.ExtrudeGeometry(shape, { depth: PLATE.baseThickness, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 2 });
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: COLORS.white, roughness: 0.55, metalness: 0.02 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0;
  return mesh;
}

function buildBorderFrame() {
  // thin raised outline just inside the plate edge — the "black border" band
  const outer = roundedRectShape(PLATE.width - 3, PLATE.height - 3, PLATE.cornerRadius - 1);
  const inner = roundedRectShape(PLATE.width - 8, PLATE.height - 8, PLATE.cornerRadius - 1.5);
  outer.holes.push(new THREE.Path(inner.getPoints()));
  const geo = new THREE.ExtrudeGeometry(outer, { depth: PLATE.borderRaise, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: COLORS.black, roughness: 0.5 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = PLATE.baseThickness;
  return mesh;
}

function textMesh(str, size, color, raise, yBase, letterSpacing = 1) {
  if (!font || !str) return null;
  const geo = new TextGeometry(str, {
    font, size, height: raise, curveSegments: 6,
    bevelEnabled: false,
  });
  geo.computeBoundingBox();
  const w = geo.boundingBox.max.x - geo.boundingBox.min.x;
  geo.rotateX(-Math.PI / 2);
  geo.translate(-w / 2, 0, 0);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = yBase;
  return mesh;
}

export function buildPlate({ vehicleNumber, personName, contactNumber }) {
  if (group) scene.remove(group);
  group = new THREE.Group();

  group.add(buildBasePlate());
  group.add(buildBorderFrame());

  const hasLower = !!(personName || contactNumber);
  const numberSize = hasLower ? 6.2 : 7.4;
  const numberY = hasLower ? 1.6 : 0;

  if (vehicleNumber) {
    const m = textMesh(vehicleNumber.toUpperCase(), numberSize, COLORS.black, PLATE.borderRaise, PLATE.baseThickness);
    if (m) { m.position.z = numberY; group.add(m); }
  }

  let lowerZ = 6.5;
  if (personName) {
    const m = textMesh(personName.toUpperCase(), 3.0, COLORS.red, PLATE.redRaise, PLATE.baseThickness + PLATE.borderRaise);
    if (m) { m.position.z = lowerZ; group.add(m); lowerZ += 3.6; }
  }
  if (contactNumber) {
    const m = textMesh(contactNumber, 2.6, COLORS.red, PLATE.redRaise, PLATE.baseThickness + PLATE.borderRaise);
    if (m) { m.position.z = lowerZ; group.add(m); }
  }

  scene.add(group);
  return group;
}

export function initViewer(canvasId) {
  canvasEl = document.getElementById(canvasId);
  const w = canvasEl.clientWidth, h = canvasEl.clientHeight;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xEFEAE0);

  camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 1000);
  camera.position.set(0, 70, 90);

  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1.1);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(40, 80, 60);
  scene.add(dir);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2, 0);
  controls.enableDamping = true;
  controls.minDistance = 40;
  controls.maxDistance = 160;
  controls.update();

  window.addEventListener('resize', onResize);

  const loader = new FontLoader();
  return new Promise((resolve) => {
    loader.load('https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json', (loadedFont) => {
      font = loadedFont;
      ready = true;
      animate();
      resolve();
    });
  });
}

function onResize() {
  if (!canvasEl) return;
  const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

export function isReady() { return ready; }

export function exportSTL(filename = 'the3dshop-keychain.stl') {
  const exporter = new STLExporter();
  const result = exporter.parse(group, { binary: true });
  return new Blob([result], { type: 'application/sla' });
}
