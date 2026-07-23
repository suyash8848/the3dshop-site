/**
 * THE 3D SHOP — order intake backend
 * ------------------------------------------------------------
 * Deploy this as a Google Apps Script Web App (free, tied to a
 * Gmail account) to receive the STL + form fields from the
 * website and email them on — no paid hosting, no server to
 * maintain.
 *
 * SETUP
 * 1. Go to script.google.com → New project. Paste this file in
 *    as Code.gs (replace the default content).
 * 2. Update DESTINATION_EMAIL below if needed.
 * 3. Click Deploy → New deployment → type "Web app".
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 4. Copy the deployment URL it gives you (ends in /exec) and
 *    paste it into SUBMIT_ENDPOINT in script.js on the website.
 * 5. Send a test order from the site and check the inbox.
 *
 * COST: free. A personal Gmail account can send up to 100
 * emails/day through Apps Script (Workspace accounts: 1,500/day)
 * — comfortably enough for an enquiry-only, made-to-order shop.
 */

const DESTINATION_EMAIL = 'theprintingbusiness2026@gmail.com';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    const stlBytes = Utilities.base64Decode(data.stlBase64);
    const stlBlob = Utilities.newBlob(stlBytes, 'application/sla', data.fileName || 'keychain.stl');

    const subject = `New keychain order — ${data.vehicleNumber}`;
    const body = [
      'New number plate keychain order from the website:',
      '',
      `Vehicle number : ${data.vehicleNumber}`,
      `Owner name     : ${data.personName}`,
      `Contact number : ${data.contactNumber}`,
      `Customer email : ${data.customerEmail}`,
      '',
      'The 3D file for this exact plate is attached.',
    ].join('\n');

    MailApp.sendEmail({
      to: DESTINATION_EMAIL,
      replyTo: data.customerEmail,
      subject: subject,
      body: body,
      attachments: [stlBlob],
    });

    // optional: send the customer a short confirmation too
    if (data.customerEmail) {
      MailApp.sendEmail({
        to: data.customerEmail,
        subject: 'We\u2019ve got your keychain order — The 3D Shop',
        body: `Thanks! We received your design for ${data.vehicleNumber} and will confirm price and delivery by email shortly.\n\n— The 3D Shop, Pune`,
      });
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
