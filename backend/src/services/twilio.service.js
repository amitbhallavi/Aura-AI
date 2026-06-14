const twilio = require("twilio");

const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SID;

let client;

function getClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio is not configured. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.");
  }
  if (!client) client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client;
}

async function sendOTP(phoneOrEmail, channel = "sms") {
  return await getClient().verify.v2.services(VERIFY_SERVICE_SID)
    .verifications.create({ to: phoneOrEmail, channel });
}

async function verifyOTP(phoneOrEmail, code) {
  const result = await getClient().verify.v2.services(VERIFY_SERVICE_SID)
    .verificationChecks.create({ to: phoneOrEmail, code });
  return result.status === "approved";
}

async function sendSMS({ to, message }) {
  if (!process.env.TWILIO_PHONE_NUMBER) throw new Error("TWILIO_PHONE_NUMBER is not configured.");
  return await getClient().messages.create({
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
    body: message,
  });
}

async function sendWhatsApp({ to, message }) {
  if (!process.env.TWILIO_WHATSAPP_NUMBER) throw new Error("TWILIO_WHATSAPP_NUMBER is not configured.");
  const toFormatted = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  return await getClient().messages.create({
    from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
    to: toFormatted,
    body: message,
  });
}

async function makeCall({ to, message, callbackUrl }) {
  const twiml = `<Response>
    <Say voice="Polly.Aditi" language="hi-IN">${message}</Say>
    <Gather numDigits="1" action="${callbackUrl}" method="POST">
      <Say voice="Polly.Aditi" language="hi-IN">Confirmation ke liye 1 dabayein.</Say>
    </Gather>
  </Response>`;
  if (!process.env.TWILIO_PHONE_NUMBER) throw new Error("TWILIO_PHONE_NUMBER is not configured.");
  return await getClient().calls.create({
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
    twiml,
  });
}

module.exports = { sendSMS, sendWhatsApp, makeCall, sendOTP, verifyOTP };
