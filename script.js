import { initViewer, updateModel, exportSTLByColor, isReady } from "./three-config.js";

// ⚠️ REQUIRED: paste your deployed Google Apps Script Web App URL here.
// See README-DEPLOY.md — this is what actually sends the design + files by email.
const APPS_SCRIPT_URL = "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE";

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
const toggleName = document.getElementById("toggleName");
const nameField = document.getElementById("nameField");
const ownerNameInput = document.getElementById("ownerName");
const nameCount = document.getElementById("nameCount");
const toggleContact = document.getElementById("toggleContact");
const contactField = document.getElementById("contactField");
const contactInput = document.getElementById("contactNumber");
const contactCount = document.getElementById("contactCount");
const emailInput = document.getElementById("email");
const form = document.getElementById("order-form");
const submitBtn = document.getElementById("submitBtn");
const formStatus = document.getElementById("formStatus");

function currentFields() {
  return {
    vehicleNumber: vehicleInput.value.trim(),
    showName: toggleName.checked,
    ownerName: ownerNameInput.value.trim(),
    showContact: toggleContact.checked,
    contactNumber: contactInput.value.trim(),
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
  scheduleUpdate();
});

toggleName.addEventListener("change", () => {
  nameField.hidden = !toggleName.checked;
  if (!toggleName.checked) ownerNameInput.value = "";
  nameCount.textContent = ownerNameInput.value.length;
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
      customerEmail: email,
      files: {
        white_base: stlFiles.white,
        black_border_number: stlFiles.black,
        red_name_contact: stlFiles.red,
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

    setStatus("Sent! We'll email you to confirm price and delivery.", "is-ok");
    form.reset();
    toggleName.checked = false; nameField.hidden = true;
    toggleContact.checked = false; contactField.hidden = true;
    vehicleCount.textContent = "0"; nameCount.textContent = "0"; contactCount.textContent = "0";
    scheduleUpdate();
  } catch (err) {
    setStatus(err.message || "Something went wrong. Please try again or DM us on Instagram.", "is-error");
  } finally {
    submitBtn.disabled = false;
  }
});
