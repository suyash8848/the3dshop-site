import { initViewer, updateModel, exportSTLByColor, isReady } from "./three-config.js";

// ⚠️ REQUIRED: paste your deployed Google Apps Script Web App URL here.
// See README-DEPLOY.md — this is what actually sends the design + files by email.
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwpScwW81bITwP1CapCoFGrJ7eNee7AYAYeUrq9kVEg-3mjJoYrHWqjovPdsPQMie0YQQ/exec";

document.getElementById("year").textContent = new Date().getFullYear();

/* ---------------- Tabs ---------------- */
const tabs = document.querySelectorAll(".viewer-tab");
const panels = document.querySelectorAll(".viewer-panel");
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => { t.classList.remove("is-active"); t.setAttribute("aria-selected", "false"); });
    panels.forEach((p) => p.classList.remove("is-active"));
    tab.classList.add("is-active");
    tab.setAttribute("aria-selected", "true");
    document.querySelector(`.viewer-panel[data-panel="${tab.dataset.tab}"]`).classList.add("is-active");
  });
});

/* ---------------- Carousel ---------------- */
const track = document.querySelector(".carousel-track");
const slides = track ? Array.from(track.children) : [];
const dotsWrap = document.querySelector(".carousel-dots");
let slideIndex = 0;

if (slides.length) {
  slides.forEach((_, i) => {
    const dot = document.createElement("span");
    if (i === 0) dot.classList.add("is-active");
    dot.addEventListener("click", () => goToSlide(i));
    dotsWrap.appendChild(dot);
  });
}

function goToSlide(i) {
  slideIndex = (i + slides.length) % slides.length;
  track.style.transform = `translateX(-${slideIndex * 100}%)`;
  Array.from(dotsWrap.children).forEach((d, idx) => d.classList.toggle("is-active", idx === slideIndex));
}
document.querySelector(".carousel-nav.prev")?.addEventListener("click", () => goToSlide(slideIndex - 1));
document.querySelector(".carousel-nav.next")?.addEventListener("click", () => goToSlide(slideIndex + 1));

/* ---------------- Viewer init ---------------- */
const canvas = document.getElementById("three-canvas");
const loadingEl = document.getElementById("three-loading");
initViewer(canvas, loadingEl);

/* ---------------- Form ---------------- */
const vehicleInput = document.getElementById("vehicleNumber");
const vehicleCount = document.getElementById("vehicleCount");
const vehicleNumberError = document.getElementById("vehicleNumberError");
const toggleName = document.getElementById("toggleName");
const nameField = document.getElementById("nameField");
const ownerNameInput = document.getElementById("ownerName");
const nameCount = document.getElementById("nameCount");
const toggleContact = document.getElementById("toggleContact");
const contactField = document.getElementById("contactField");
const contactInput = document.getElementById("contactNumber");
const contactCount = document.getElementById("contactCount");
const accentColorField = document.getElementById("accentColorField");
const swatches = Array.from(document.querySelectorAll(".swatch"));
const emailInput = document.getElementById("email");
const form = document.getElementById("order-form");
const submitBtn = document.getElementById("submitBtn");
const formStatus = document.getElementById("formStatus");

let accentColor = "red";

// Indian vehicle registration format: 2-letter state code, 1-2 digit RTO
// code, optional 1-3 letter series, 4-digit unique number — spaces/hyphens
// optional between groups (e.g. "MH 12 AB 3456", "MH41C0002").
const VEHICLE_NUMBER_PATTERN = /^[A-Z]{2}[\s-]?[0-9]{1,2}[\s-]?[A-Z]{0,3}[\s-]?[0-9]{4}$/;

function isValidVehicleNumber(value) {
  return VEHICLE_NUMBER_PATTERN.test(value.trim().toUpperCase());
}

function checkVehicleNumberValidity() {
  const value = vehicleInput.value.trim();
  const valid = !value || isValidVehicleNumber(value);
  vehicleInput.classList.toggle("is-invalid", !valid);
  vehicleNumberError.hidden = valid;
  return !value || valid; // empty is handled separately (required-field check on submit)
}

function updateAccentFieldVisibility() {
  accentColorField.hidden = !(toggleName.checked || toggleContact.checked);
}

swatches.forEach((btn) => {
  btn.addEventListener("click", () => {
    accentColor = btn.dataset.color;
    swatches.forEach((s) => s.classList.toggle("is-active", s === btn));
    scheduleUpdate();
  });
});

function currentFields() {
  return {
    vehicleNumber: vehicleInput.value.trim(),
    showName: toggleName.checked,
    ownerName: ownerNameInput.value.trim(),
    showContact: toggleContact.checked,
    contactNumber: contactInput.value.trim(),
    accentColor,
  };
}

let debounceTimer = null;
function scheduleUpdate() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => updateModel(currentFields()), 180);
}

vehicleInput.addEventListener("input", () => {
  vehicleInput.value = vehicleInput.value.toUpperCase();
  vehicleCount.textContent = vehicleInput.value.length;
  checkVehicleNumberValidity();
  scheduleUpdate();
});
vehicleInput.addEventListener("blur", checkVehicleNumberValidity);

toggleName.addEventListener("change", () => {
  nameField.hidden = !toggleName.checked;
  if (!toggleName.checked) ownerNameInput.value = "";
  nameCount.textContent = ownerNameInput.value.length;
  updateAccentFieldVisibility();
  scheduleUpdate();
});
ownerNameInput.addEventListener("input", () => {
  nameCount.textContent = ownerNameInput.value.length;
  scheduleUpdate();
});

toggleContact.addEventListener("change", () => {
  contactField.hidden = !toggleContact.checked;
  if (!toggleContact.checked) contactInput.value = "";
  contactCount.textContent = contactInput.value.length;
  updateAccentFieldVisibility();
  scheduleUpdate();
});
contactInput.addEventListener("input", () => {
  contactInput.value = contactInput.value.replace(/[^0-9]/g, "").slice(0, 10);
  contactCount.textContent = contactInput.value.length;
  scheduleUpdate();
});

/* ---------------- Submit ---------------- */
function setStatus(message, type) {
  formStatus.textContent = message;
  formStatus.classList.remove("is-error", "is-ok");
  if (type) formStatus.classList.add(type);
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const fields = currentFields();
  const email = emailInput.value.trim();

  if (!fields.vehicleNumber) { setStatus("Add your vehicle number first.", "is-error"); vehicleInput.focus(); return; }
  if (!isValidVehicleNumber(fields.vehicleNumber)) {
    checkVehicleNumberValidity();
    setStatus("That doesn't look like a valid vehicle number — check the format (e.g. MH 12 AB 3456).", "is-error");
    vehicleInput.focus();
    return;
  }
  if (!email) { setStatus("Add your email so we can reach you.", "is-error"); emailInput.focus(); return; }
  if (!isReady()) { setStatus("The 3D preview is still loading — one moment and try again.", "is-error"); return; }

  submitBtn.disabled = true;
  setStatus("Generating your design file…", null);

  try {
    const stlFiles = exportSTLByColor();
    if (!stlFiles || !stlFiles.white) throw new Error("Could not generate the 3D file. Please try again.");

    setStatus("Sending your design to us…", null);

    const payload = {
      vehicleNumber: fields.vehicleNumber,
      ownerName: fields.showName ? fields.ownerName : "",
      contactNumber: fields.showContact ? fields.contactNumber : "",
      accentColor: fields.showName || fields.showContact ? fields.accentColor : "",
      customerEmail: email, // for the shop's reference/follow-up only — never emailed to
      files: {
        white_base: stlFiles.white,
        black_border_number: stlFiles.black,
        accent_name_contact: stlFiles.accent,
      },
    };

    if (APPS_SCRIPT_URL.startsWith("PASTE_")) {
      throw new Error("Order backend isn't configured yet — see README-DEPLOY.md.");
    }

    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      // text/plain avoids a CORS preflight against Apps Script web apps
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({ ok: res.ok }));
    if (!res.ok || data.ok === false) throw new Error(data.error || "Something went wrong sending your design.");

    setStatus("Sent! Your design and files are on their way to us — we'll be in touch to confirm price and delivery.", "is-ok");
    form.reset();
    toggleName.checked = false; nameField.hidden = true;
    toggleContact.checked = false; contactField.hidden = true;
    accentColor = "red";
    swatches.forEach((s) => s.classList.toggle("is-active", s.dataset.color === "red"));
    updateAccentFieldVisibility();
    vehicleCount.textContent = "0"; nameCount.textContent = "0"; contactCount.textContent = "0";
    vehicleInput.classList.remove("is-invalid");
    vehicleNumberError.hidden = true;
    scheduleUpdate();
  } catch (err) {
    setStatus(err.message || "Something went wrong. Please try again or DM us on Instagram.", "is-error");
  } finally {
    submitBtn.disabled = false;
  }
});
