// ============================================================
// Phone Config Controller - Twilio calling, SMS, WhatsApp
// ============================================================
const {
  buildPhoneTwiml,
  getSanitizedPhoneConfig,
  makeConfiguredCall,
  savePhoneConfigForUser,
  setActiveModeForUser,
  sendConfiguredSMS,
  sendConfiguredWhatsApp,
  testTwilioConnection,
} = require("../services/phoneConfig.service");
const { pgPool } = require("../config/database");

function sendControllerError(res, err, fallbackMessage) {
  const statusCode = err.statusCode || err.status || 500;
  if (statusCode >= 500) console.error("Phone config error:", err.message);
  return res.status(statusCode).json({
    error: err.message || fallbackMessage,
    code: err.code || "PHONE_CONFIG_ERROR",
  });
}

async function getPhoneConfig(req, res) {
  try {
    const config = await getSanitizedPhoneConfig(req.user.id);
    res.json(config);
  } catch (err) {
    sendControllerError(res, err, "Failed to load phone configuration.");
  }
}

async function savePhoneConfig(req, res) {
  try {
    const config = await savePhoneConfigForUser(req.user.id, req.body);
    res.json({ message: "Phone configuration saved.", config });
  } catch (err) {
    sendControllerError(res, err, "Failed to save phone configuration.");
  }
}

async function setActiveMode(req, res) {
  try {
    const config = await setActiveModeForUser(req.user.id, req.body.mode || req.body.activeMode);
    res.json({ message: "Active phone mode updated.", config });
  } catch (err) {
    sendControllerError(res, err, "Failed to update active phone mode.");
  }
}

async function testConnection(req, res) {
  try {
    const result = await testTwilioConnection({
      userId: req.user.id,
      mode: req.body.mode || req.body.type || req.body.activeMode,
      credentials: req.body.credentials,
    });
    res.json(result);
  } catch (err) {
    sendControllerError(res, err, "Twilio connection test failed.");
  }
}

async function makeOutboundCall(req, res) {
  try {
    const { to, toNumber, phoneNumber, message, mode, activeMode } = req.body;
    const result = await makeConfiguredCall({
      userId: req.user.id,
      mode: mode || activeMode,
      to: to || toNumber || phoneNumber,
      message: message || "This is a call from Aura AI.",
      req,
    });

    await pgPool.query(
      `INSERT INTO calls (user_id, phone_number, contact_name, purpose, message, scheduled_at, status, twilio_sid, phone_mode, from_number)
       VALUES ($1, $2, $3, 'general', $4, NOW(), 'ongoing', $5, $6, $7)`,
      [
        req.user.id,
        result.to,
        null,
        message || "This is a call from Aura AI.",
        result.sid,
        result.mode,
        result.from,
      ]
    ).catch(() => {});

    res.status(201).json({ message: "Call initiated.", ...result });
  } catch (err) {
    sendControllerError(res, err, "Failed to initiate call.");
  }
}

async function sendSMS(req, res) {
  try {
    const { to, toNumber, phoneNumber, body, content, message, mode, activeMode } = req.body;
    const result = await sendConfiguredSMS({
      userId: req.user.id,
      mode: mode || activeMode,
      to: to || toNumber || phoneNumber,
      body: body || content || message,
    });

    res.status(201).json({ message: "SMS sent.", ...result });
  } catch (err) {
    sendControllerError(res, err, "Failed to send SMS.");
  }
}

async function sendWhatsApp(req, res) {
  try {
    const { to, toNumber, phoneNumber, body, content, message, mode, activeMode } = req.body;
    const result = await sendConfiguredWhatsApp({
      userId: req.user.id,
      mode: mode || activeMode,
      to: to || toNumber || phoneNumber,
      body: body || content || message,
    });

    res.status(201).json({ message: "WhatsApp message sent.", ...result });
  } catch (err) {
    sendControllerError(res, err, "Failed to send WhatsApp message.");
  }
}

function phoneTwiml(req, res) {
  res.set("Content-Type", "text/xml");
  res.send(buildPhoneTwiml(req.query.message));
}

module.exports = {
  getPhoneConfig,
  makeOutboundCall,
  phoneTwiml,
  savePhoneConfig,
  setActiveMode,
  sendSMS,
  sendWhatsApp,
  testConnection,
};
