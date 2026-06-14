const { pgPool } = require("../config/database");
const { emitNotification } = require("../services/socket.service");
const { findUserIdByTwilioPhone } = require("../services/phoneConfig.service");

function isWebhookAllowed(req) {
  const secret = String(process.env.TWILIO_WEBHOOK_SECRET || "").trim();
  if (!secret) return true;
  return req.query.secret === secret || req.headers["x-aura-webhook-secret"] === secret;
}

function clean(value) {
  return String(value || "").trim();
}

function mapCallStatus(status) {
  const value = clean(status).toLowerCase();
  if (value === "completed") return "completed";
  if (value === "in-progress" || value === "ringing" || value === "queued" || value === "initiated") return "ongoing";
  if (value === "no-answer") return "missed";
  if (value === "canceled") return "cancelled";
  if (value === "busy" || value === "failed") return "failed";
  return "ongoing";
}

function notificationName(call) {
  return call.contact_name || call.phone_number || "contact";
}

async function handleTwilioCallStatus(req, res) {
  if (!isWebhookAllowed(req)) return res.status(401).send("Unauthorized");

  const callSid = clean(req.body.CallSid || req.body.CallSidParent);
  const status = mapCallStatus(req.body.CallStatus);
  const duration = Number.parseInt(req.body.CallDuration, 10);

  if (!callSid) return res.status(400).send("Missing CallSid");

  try {
    const result = await pgPool.query(
      `UPDATE calls
       SET status = $1,
           duration_sec = COALESCE($3, duration_sec),
           updated_at = NOW()
       WHERE twilio_sid = $2
       RETURNING *`,
      [status, callSid, Number.isFinite(duration) ? duration : null]
    );

    const call = result.rows[0];
    if (call && status === "completed") {
      emitNotification(call.user_id, {
        type: "call_completed",
        title: "Call completed",
        message: `Call with ${notificationName(call)} is complete.`,
        data: { callId: call.id, status: call.status },
      });
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Twilio call status webhook error:", err.message);
    res.status(500).send("Webhook failed");
  }
}

async function handleTwilioIncomingMessage(req, res) {
  if (!isWebhookAllowed(req)) return res.status(401).send("Unauthorized");

  const from = clean(req.body.From);
  const to = clean(req.body.To);
  const body = clean(req.body.Body);
  const sid = clean(req.body.MessageSid || req.body.SmsMessageSid || req.body.SmsSid);
  const platform = from.startsWith("whatsapp:") || to.startsWith("whatsapp:") ? "whatsapp" : "sms";

  if (!from || !to || !body) return res.status(400).send("Missing message payload");

  try {
    const userId = await findUserIdByTwilioPhone(to);
    if (!userId) {
      return res.type("text/xml").status(200).send("<Response></Response>");
    }

    const result = await pgPool.query(
      `INSERT INTO messages (user_id, to_number, contact_name, platform, content, status, twilio_sid)
       VALUES ($1, $2, $3, $4, $5, 'delivered', $6)
       RETURNING *`,
      [userId, from.replace(/^whatsapp:/, ""), null, platform, body, sid || null]
    );

    const message = result.rows[0];
    emitNotification(userId, {
      type: "message_received",
      title: `New ${platform === "whatsapp" ? "WhatsApp" : "SMS"} received`,
      message: body.length > 90 ? `${body.slice(0, 87)}...` : body,
      data: { messageId: message.id, platform, from },
    });

    res.type("text/xml").status(200).send("<Response></Response>");
  } catch (err) {
    console.error("Twilio incoming message webhook error:", err.message);
    res.status(500).send("Webhook failed");
  }
}

module.exports = { handleTwilioCallStatus, handleTwilioIncomingMessage };
