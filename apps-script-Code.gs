/**
 * The 3D Shop — order intake backend.
 *
 * Deploy this as a Web App (Deploy > New deployment > type: Web app,
 * "Execute as": Me, "Who has access": Anyone). Paste the resulting
 * /exec URL into APPS_SCRIPT_URL in script.js.
 *
 * The page POSTs JSON as text/plain (to avoid a CORS preflight, which
 * Apps Script web apps can't answer), containing the customer's fields
 * and ONE base64-encoded STL file with the complete merged design
 * (base + border + vehicle number + name/contact, all in one mesh).
 *
 * IMPORTANT: the customer's email is collected and included in the order
 * summary (for the shop's own follow-up), but this script NEVER sends
 * anything to it — the design file and order details go ONLY to
 * SHOP_EMAIL below. There is no confirmation email to the customer.
 *
 * NOTE ON COLOUR: a plain STL has no per-region colour/filament data, so
 * this single file needs its white/black/accent regions assigned in
 * Bambu Studio's multi-filament "Paint" tool after import (Edit > Color
 * Painting) — same as any other single-body multi-material model.
 */

const SHOP_EMAIL = "theprintingbusiness2026@gmail.com";

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { vehicleNumber, ownerName, contactNumber, accentColor, customerEmail, stlFile } = body;

    if (!vehicleNumber || !customerEmail) {
      return jsonOutput({ ok: false, error: "Missing vehicle number or email." });
    }
    if (!stlFile) {
      return jsonOutput({ ok: false, error: "Missing design file." });
    }

    const safeName = vehicleNumber.replace(/[^A-Z0-9]/gi, "");
    const bytes = Utilities.base64Decode(stlFile);
    const blob = Utilities.newBlob(bytes, "application/sla", `${safeName}.stl`);

    const summary = [
      `Vehicle number: ${vehicleNumber}`,
      `Owner name: ${ownerName || "(not included)"}`,
      `Contact number on plate: ${contactNumber || "(not included)"}`,
      `Name/contact colour: ${accentColor || "(n/a)"}`,
      `Customer email (for your follow-up — not emailed by this script): ${customerEmail}`,
      `Submitted: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
    ].join("\n");

    // Sent ONLY to the shop. No email is ever sent to customerEmail.
    MailApp.sendEmail({
      to: SHOP_EMAIL,
      subject: `New keychain order — ${vehicleNumber}`,
      body: `New order from the site:\n\n${summary}\n\nOne STL file attached with the complete design (assign filament colours in Bambu Studio's Paint tool).`,
      attachments: [blob],
    });

    return jsonOutput({ ok: true });
  } catch (err) {
    return jsonOutput({ ok: false, error: err.message });
  }
}

function doGet() {
  return jsonOutput({ ok: true, message: "The 3D Shop order backend is running." });
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
