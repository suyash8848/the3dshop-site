import { initViewer, buildPlate, exportSTL } from './three-config.js';

// ---------- IMPORTANT: set this after deploying your Apps Script Web App ----------
// See the "Emailing the finished design" section of the hosting guide.
const SUBMIT_ENDPOINT = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';
// -----------------------------------------------------------------------------------

const els = {
  vehicleNumber: document.getElementById('vehicleNumber'),
  personName: document.getElementById('personName'),
  contactNumber: document.getElementById('contactNumber'),
  orderEmail: document.getElementById('orderEmail'),
  nameToggle: document.getElementById('nameToggle'),
  contactToggle: document.getElementById('contactToggle'),
  vehicleCount: document.getElementById('vehicleCount'),
  nameCount: document.getElementById('nameCount'),
  contactCount: document.getElementById('contactCount'),
  form: document.getElementById('customiseForm'),
  submitBtn: document.getElementById('submitBtn'),
  formMsg: document.getElementById('formMsg'),
  viewerLoading: document.getElementById('viewerLoading'),
};

// ---------- gallery tabs (photos vs live 3D) ----------
const tabs = document.querySelectorAll('.gallery-tab');
const carouselView = document.getElementById('carouselView');
const viewerView = document.getElementById('viewerView');
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const showViewer = tab.dataset.view === 'viewer';
    carouselView.classList.toggle('active', !showViewer);
    viewerView.classList.toggle('active', showViewer);
  });
});

// ---------- photo carousel ----------
const photos = ['images/product-preview-1.jpg', 'images/product-preview-2.jpg'];
let photoIndex = 0;
const carouselImg = document.getElementById('carouselImg');
const dots = document.querySelectorAll('#carouselDots span');
function showPhoto(i) {
  photoIndex = (i + photos.length) % photos.length;
  carouselImg.src = photos[photoIndex];
  dots.forEach((d, idx) => d.classList.toggle('active', idx === photoIndex));
}
document.getElementById('carouselPrev').addEventListener('click', () => showPhoto(photoIndex - 1));
document.getElementById('carouselNext').addEventListener('click', () => showPhoto(photoIndex + 1));

// ---------- optional field toggles ----------
els.nameToggle.addEventListener('change', () => {
  els.personName.disabled = !els.nameToggle.checked;
  if (!els.nameToggle.checked) els.personName.value = '';
  updateCounts();
  scheduleRebuild();
});
els.contactToggle.addEventListener('change', () => {
  els.contactNumber.disabled = !els.contactToggle.checked;
  if (!els.contactToggle.checked) els.contactNumber.value = '';
  updateCounts();
  scheduleRebuild();
});

function updateCounts() {
  els.vehicleCount.textContent = els.vehicleNumber.value.length;
  els.nameCount.textContent = els.personName.value.length;
  els.contactCount.textContent = els.contactNumber.value.length;
}

// ---------- live 3D preview ----------
let rebuildTimer = null;
function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuildPlate, 250);
}
function currentFields() {
  return {
    vehicleNumber: els.vehicleNumber.value.trim(),
    personName: els.nameToggle.checked ? els.personName.value.trim() : '',
    contactNumber: els.contactToggle.checked ? els.contactNumber.value.trim() : '',
  };
}
function rebuildPlate() {
  const fields = currentFields();
  if (!fields.vehicleNumber) return;
  buildPlate(fields);
}

[els.vehicleNumber, els.personName, els.contactNumber].forEach(input => {
  input.addEventListener('input', () => { updateCounts(); scheduleRebuild(); });
});

// ---------- init three.js viewer ----------
initViewer('three-canvas').then(() => {
  els.viewerLoading.style.display = 'none';
  els.vehicleNumber.value = 'MH41C0002';
  updateCounts();
  rebuildPlate();
});

// ---------- form submit: export STL + send to backend ----------
els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fields = currentFields();
  const email = els.orderEmail.value.trim();
  els.formMsg.textContent = '';
  els.formMsg.className = 'form-msg';

  if (!fields.vehicleNumber) {
    els.formMsg.textContent = 'Vehicle number is required.';
    els.formMsg.classList.add('error');
    return;
  }
  if (!email) {
    els.formMsg.textContent = 'Please add your email so we can reach you.';
    els.formMsg.classList.add('error');
    return;
  }
  if (SUBMIT_ENDPOINT.startsWith('PASTE_')) {
    els.formMsg.textContent = 'Order backend isn\u2019t configured yet — see the hosting guide to connect the Apps Script endpoint.';
    els.formMsg.classList.add('error');
    return;
  }

  els.submitBtn.disabled = true;
  els.submitBtn.textContent = 'Generating your design…';

  try {
    rebuildPlate(); // ensure the exported mesh matches the latest field values
    const blob = exportSTL();
    const base64 = await blobToBase64(blob);

    const payload = {
      vehicleNumber: fields.vehicleNumber,
      personName: fields.personName || '(not included)',
      contactNumber: fields.contactNumber || '(not included)',
      customerEmail: email,
      stlBase64: base64,
      fileName: `keychain-${fields.vehicleNumber.replace(/\s+/g, '')}.stl`,
    };

    const res = await fetch(SUBMIT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // avoids a CORS preflight to Apps Script
      body: JSON.stringify(payload),
    });
    const result = await res.json();

    if (result.ok) {
      els.formMsg.textContent = 'Sent! We\u2019ll confirm your order by email shortly.';
      els.formMsg.classList.add('ok');
      els.form.reset();
    } else {
      throw new Error(result.error || 'Unknown error');
    }
  } catch (err) {
    els.formMsg.textContent = 'Something went wrong sending your design — please try again or DM us on Instagram.';
    els.formMsg.classList.add('error');
    console.error(err);
  } finally {
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = 'Finalise & send design';
  }
});

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// footer year
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();
