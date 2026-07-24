/**
 * The 3D Shop — order intake backend.
 *
 * Deploy this as a Web App (Deploy > New deployment > type: Web app,
 * "Execute as": Me, "Who has access": Anyone). Paste the resulting
 * /exec URL into APPS_SCRIPT_URL in script.js.
 *
 * The page POSTs JSON as text/plain (to avoid a CORS preflight, which
 * Apps Script web apps can't answer), containing the customer's fields
 * and up to 3 base64-encoded STL files (one per print colour).
 */

const SHOP_EMAIL = "theprintingbusiness2026@gmail.com";

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { vehicleNumber, ownerName, contactNumber, accentColor, files } = body;

    if (!vehicleNumber) {
      return jsonOutput({ ok: false, error: "Missing vehicle number." });
    }

    const attachments = [];
    const safeName = vehicleNumber.replace(/[^A-Z0-9]/gi, "");
    Object.entries(files || {}).forEach(([label, b64]) => {
      if (!b64) return;
      const bytes = Utilities.base64Decode(b64);
      const blob = Utilities.newBlob(bytes, "application/sla", `${safeName}_${label}.stl`);
      attachments.push(blob);
    });

    const summary = [
      `Vehicle number: ${vehicleNumber}`,
      `Owner name: ${ownerName || "(not included)"}`,
      `Contact number on plate: ${contactNumber || "(not included)"}`,
      `Name/contact colour: ${accentColor || "(n/a)"}`,
      `Submitted: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
    ].join("\n");

    MailApp.sendEmail({
      to: SHOP_EMAIL,
      subject: `New keychain order — ${vehicleNumber}`,
      body: `New order from the site:\n\n${summary}\n\nSTL files attached (one per print colour: white/black/${accentColor || "accent"}).`,
      attachments,
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
