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
    const { vehicleNumber, ownerName, contactNumber, accentColor, customerEmail, files } = body;

    if (!vehicleNumber || !customerEmail) {
      return jsonOutput({ ok: false, error: "Missing vehicle number or email." });
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
      `Customer email: ${customerEmail}`,
      `Submitted: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
    ].join("\n");

    MailApp.sendEmail({
      to: SHOP_EMAIL,
      subject: `New keychain order — ${vehicleNumber}`,
      body: `New order from the site:\n\n${summary}\n\nSTL files attached (one per print colour: white/black/${accentColor || "accent"}).`,
      attachments,
    });

    // Best-effort confirmation to the customer — don't fail the order if this errors.
    try {
      MailApp.sendEmail({
        to: customerEmail,
        subject: "We've received your keychain design — The 3D Shop",
        body:
          `Hi,\n\nThanks — we've received your custom number plate keychain design (${vehicleNumber}).\n` +
          `We'll confirm final price and delivery with you shortly by email.\n\n— The 3D Shop, Pune`,
      });
    } catch (err) {
      // ignore
    }

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
