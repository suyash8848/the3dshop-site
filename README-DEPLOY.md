# The 3D Shop — single-product site, rebuilt

This replaces `index.html`, `styles.css`, `script.js`, `three-config.js`,
`apps-script-Code.gs`, and adds two product images. Copy all of these
straight into your `the3dshop-site` repo (keep your own `images/logo.svg`
if you already have a real brand mark — don't overwrite it with the
placeholder one included here unless you want to).

## ⚠️ The live site is NOT running this code yet

When I checked https://the3dshop.in/ it was still serving the **original
90 × 22mm** version with no colour picker and no validation — i.e. none
of the rebuild from this whole conversation is deployed. **Every fix
we've discussed only exists in these files, not on the live site.**

So if a change "isn't working" on the live site, the first thing to rule
out is deployment: push `index.html`, `script.js`, `three-config.js`,
`styles.css`, and `apps-script-Code.gs` to the repo's `main` branch, let
GitHub Pages redeploy, then hard-refresh (Ctrl/Cmd+Shift+R) to clear the
cached old version. Until that's confirmed, we'd be debugging a site that
isn't running any of this code.



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

## Dimensions — measured directly from your STEP file

`number_plate.step` doesn't carry an explicit "size" property, but its raw
geometry does: every `CARTESIAN_POINT` in the file has X/Y/Z coordinates, so
the bounding box and layer heights can be read straight out of the point
cloud. That gave:

- **Footprint: 96mm × 28mm** (not 90×22 as the first pass guessed — updated
  everywhere, including the size chip on the page)
- **Total thickness: 3.2mm**, in 3 steps: 0→2.0mm base (white), 2.0→2.8mm
  border/ribbon (black, 0.8mm rise), 2.8→3.2mm text (0.4mm rise)
- **Outer corner radius: 3.5mm**

`three-config.js` now uses these exact numbers. One thing the STEP file
does *not* contain: a keyring through-hole — none of its 33 circular edges
correspond to one (they're all corner fillets on the plate and the
diagonal ribbon). Your `.3mf` is a **gcode-only** export from Bambu Studio
(print-ready package, no mesh), so it couldn't confirm the hole's exact
position either. I kept a hole in the live preview near the same spot
visible in your reference photos, but if you have the actual hole
coordinates (or a newer STEP with it modeled), send them over and I'll
match it exactly.

## Layout correction — traced from your actual STL

Your `key_chain_stl.stl` let me slice the real mesh at several heights and
trace its exact cross-sections. That showed the earlier layout was wrong
in a structural way, not just a dimension: there's no separate diagonal
"ribbon" on one side. The real design is a centred, dog-tag-style layout:

- A **thin (~1.5mm) border strip** runs the full perimeter, but flares
  into **much wider black margins at the top-middle and bottom-middle**
  of the plate (connected to the thin strip by 45°-ish chamfers).
- **Vehicle number** (black) spans nearly the full width, horizontally
  and vertically centred, in the white channel between the two margins.
- **Owner name** (red) sits centred horizontally in the **top** margin.
- **Contact number** (red) sits centred horizontally in the **bottom**
  margin — narrower than the name's margin, matched to what the real
  part shows.

`three-config.js` now builds the border as one traced polygon (measured
vertex-by-vertex from the STL) instead of a frame + side ribbon, and
repositions all three text fields to match.



Switched the live-preview text from Helvetiker Bold to **Droid Sans Bold**
(a plainer, more neutral sans-serif) per your note. If "sans serif
collections" refers to a specific licensed font you own, share the `.ttf`/
`.otf` and I'll convert it to the `typeface.json` format Three.js needs so
the preview uses your exact typeface.

## Latest round of fixes

- **Keyring loop removed** from the live preview — it's a decorative
  Three.js extra, not part of the printed part, and its orientation
  wasn't reading correctly, so it's gone rather than fixed.
- **Name & contact colour is now a choice**, not fixed red. A swatch
  picker (red / yellow / green) appears once either field is turned on.
  The selected colour is baked into the exported STL and included in the
  order email/attachment names.
- **Added your 3 new render screenshots** to the Photos carousel
  (`product-preview-3/4/5.jpg`), showing the yellow, green, and red
  variants.

## Round: CAD drawing re-dimension + validation

- **Re-dimensioned from your CAD drawing.** Your annotated drawing gave
  clean, authoritative numbers that supersede the earlier STL-traced
  estimates: top margin flat width **35.00mm**, bottom margin flat width
  **25.00mm**, margin depth **7.00mm** (both top and bottom), thin border
  **1.50mm**, keyring hole **Ø4.00mm**, vehicle number text sized to a
  **10mm** bounding height.
- **Vehicle number format validation.** The vehicle number field now
  checks against the standard Indian registration pattern (2 letters +
  1–2 digits + optional 1–3 letter series + 4 digits, e.g. `MH 12 AB
  3456`), live as you type and again on submit. Invalid input shows an
  inline message and blocks sending.
- **Bug pass.** Went through `index.html`, `script.js`, `three-config.js`,
  and `apps-script-Code.gs` end-to-end for consistency — no open issues
  found.

## Round: corner radius corrected

- In the previous round I misread the drawing's corner-radius label as
  2.5mm. You measured directly in CAD and confirmed it's actually
  **3.5mm** (matching the very first STEP-file reading) — the keyring
  hole radius measured at **2.00mm** too, which already matched.
  `CORNER_R` is back to 3.5mm in `three-config.js`.


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

## Round: hole artifact properly diagnosed and fixed

The previous two attempts at the hole were wrong. I re-sliced your STL and
measured the real geometry directly instead of guessing:

- **The hole is concentric with the top-left rounded corner.** The outer
  corner arc fits center (3.5, 24.5) radius 3.5mm; the hole loop sits at
  center (3.48, 24.53) radius 2.0mm — the *same point*, 3.5mm in from each
  edge. My earlier "move it to 4.2mm inset" was simply wrong.
- **The hole sits right on the black/white boundary.** Sampling material
  height around the hole rim: the corner side (up-and-left) is black
  border; the interior side (down-and-right) is white base. The black
  wraps the corner side of the hole in a C-shape.
- **Root cause of the "poking out":** my code cut the keyring hole as a
  separate full circle *and* cut the margin polygon, and near the corner
  those two cut-paths overlapped — two overlapping holes in one extrude
  is a self-intersecting profile, which is what rendered as a spike.
- **The fix:** on the black layer the hole is no longer a separate circle.
  The margin cutout's top-left corner now routes as an **arc around the
  hole**, merging the hole and the cutout into one continuous boundary —
  exactly how your STL is modelled. I verified the resulting profile in a
  standalone geometry check: zero self-intersections, nothing outside the
  plate outline, corner stays black, hole interior stays white. The white
  base layer still cuts the hole as a normal circle (it has 1.5mm
  clearance to the outer edge, also verified).
- **Margin polygon** replaced with coordinates traced directly from the
  STL cross-section (Douglas–Peucker simplified), so the whole black shape
  now follows the real part rather than drawing-derived estimates.
- **Contact number / owner name swap** kept: contact on top, name on
  bottom.

I could not run an actual Three.js render here (no network to load the
library), so I validated the 2D extrude profile mathematically instead —
that's the layer the artifact lives in. Please still eyeball the live
preview once it's deployed.


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
