# The 3D Shop — single-product site, rebuilt

This replaces `index.html`, `styles.css`, `script.js`, `three-config.js`,
`apps-script-Code.gs`, and adds two product images. Copy all of these
straight into your `the3dshop-site` repo (keep your own `images/logo.svg`
if you already have a real brand mark — don't overwrite it with the
placeholder one included here unless you want to).

## What's actually working right now

- **Photos tab** — a small carousel of your two Bambu Studio slicer renders.
- **Live 3D preview tab** — a real, live Three.js model that rebuilds as you
  type: white base, black border + vehicle number, red name + contact
  number. Drag to rotate, scroll to zoom.
- **Form** — vehicle number always on; name and contact number are each
  behind a toggle, so a customer can order plate-only, plate+name, or the
  full set.
- **Finalise & send design** — generates **three STL files** client-side
  (one per print colour: white base, black border+number, red name+contact)
  and POSTs them + the customer's details to a Google Apps Script Web App,
  which emails everything to `theprintingbusiness2026@gmail.com` and sends
  the customer a short confirmation.

## What you need to do to make it live

### 1. Deploy the email backend (5 minutes)
1. Go to [script.google.com](https://script.google.com), new project.
2. Delete the placeholder code, paste in `apps-script-Code.gs`.
3. **Deploy → New deployment → type: Web app.**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Copy the `.../exec` URL it gives you.
5. Open `script.js`, replace `PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE` with
   that URL.
6. First time you deploy, Google will ask you to authorize the script
   (it's sending email as you) — approve it.

### 2. Commit and push
Push the updated files to `main`. GitHub Pages / your CNAME setup should
pick it up automatically since nothing about hosting changed.

### 3. Test it
Fill in a vehicle number, rotate the live preview, hit "Finalise & send
design", and check that an email with 1–3 `.stl` attachments arrives at
the shop inbox.

## Honest limitations, so nothing surprises you

- **STL, not STEP.** Your uploaded `number_plate.step` is a one-off CAD
  export with the text ("MH41C0002 / Suyash") permanently baked into the
  surfaces — it's not a template that can take new text. Turning arbitrary
  customer text into a *new* STEP file needs a real CAD kernel (e.g. a
  small server running CadQuery/build123d, or OpenCascade.js in-browser),
  which is a separate, heavier build. STL is what your slicer (Bambu
  Studio) actually needs anyway, so the current flow already gives you a
  usable file per colour — just not a parametric STEP.
- **The 3D preview is a close visual match, not a replica of your exact
  CAD file.** It's built from simple shapes (rounded plate, frame, a
  diagonal ribbon, extruded text) tuned to look like your reference photos
  and slicer render, and it updates live and renders in the right 3
  colours. If you want pixel-perfect fidelity to your exact model later,
  that's a good next step once the CAD-kernel backend above exists.
- **Font.** The live text uses a bold sans (Helvetiker Bold, loaded from a
  CDN) rather than your exact plate typeface — close enough for a live
  preview, easy to swap once you pick a licensed font.
- **Fonts/Three.js load from CDN** (jsDelivr), so the page needs internet
  access to render — fine for a public website, just flagging it.

## Files in this drop
```
index.html            page structure
styles.css             all styling
script.js               form logic, tabs, carousel, submit flow
three-config.js         3D scene, live model builder, STL export
apps-script-Code.gs      backend: emails the order + STL attachments
images/product-preview-1.jpg   your slicer render (photos tab)
images/product-preview-2.jpg   your slicer render (photos tab)
images/logo.svg          placeholder mark — replace with your real logo.svg
```
