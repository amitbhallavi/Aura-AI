// ============================================================
// Message Controller — SMS, WhatsApp via Twilio
// ============================================================
const { pgPool } = require("../config/database");
const {
  sendConfiguredSMS,
  sendConfiguredWhatsApp,
} = require("../services/phoneConfig.service");

// ---------------------------------------------------------------
// POST /api/messages/sms
// Body: { toNumber, contactName?, content }
// ---------------------------------------------------------------
async function sendSMS(req, res) {
  const { toNumber, contactName, content, source, createdByAI, phoneMode, activeMode } = req.body;

  if (!toNumber || !content) {
    return res.status(400).json({ error: "toNumber and content are required." });
  }

  try {
    const twilioMsg = await sendConfiguredSMS({
      userId: req.user.id,
      mode: phoneMode || activeMode,
      to: toNumber,
      body: content,
    });

    // Log to DB
    const result = await pgPool.query(
      `INSERT INTO messages (user_id, to_number, contact_name, platform, content, twilio_sid)
       VALUES ($1, $2, $3, 'sms', $4, $5) RETURNING *`,
      [req.user.id, toNumber, contactName || null, content, twilioMsg.sid]
    );

    const message = result.rows[0];
    if (source === "ai" || createdByAI) {
      await pgPool.query(
        `INSERT INTO tasks (user_id, title, type, source, related_service, related_record_id, metadata, created_by_ai)
         VALUES ($1, $2, 'message', 'ai', 'sms', $3, $4::jsonb, TRUE)`,
        [req.user.id, `SMS sent: ${contactName || toNumber}`, message.id, JSON.stringify({ toNumber, content })]
      ).catch(() => {});
    }

    res.status(201).json(message);
  } catch (err) {
    console.error("SMS error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to send SMS.", code: err.code });
  }
}

// ---------------------------------------------------------------
// POST /api/messages/whatsapp
// Body: { toNumber, contactName?, content }
// ---------------------------------------------------------------
async function sendWhatsApp(req, res) {
  const { toNumber, contactName, content, source, createdByAI, phoneMode, activeMode } = req.body;

  if (!toNumber || !content) {
    return res.status(400).json({ error: "toNumber and content are required." });
  }

  try {
    const twilioMsg = await sendConfiguredWhatsApp({
      userId: req.user.id,
      mode: phoneMode || activeMode,
      to: toNumber,
      body: content,
    });

    // Log to DB
    const result = await pgPool.query(
      `INSERT INTO messages (user_id, to_number, contact_name, platform, content, twilio_sid)
       VALUES ($1, $2, $3, 'whatsapp', $4, $5) RETURNING *`,
      [req.user.id, toNumber, contactName || null, content, twilioMsg.sid]
    );

    const message = result.rows[0];
    if (source === "ai" || createdByAI) {
      await pgPool.query(
        `INSERT INTO tasks (user_id, title, type, source, related_service, related_record_id, metadata, created_by_ai)
         VALUES ($1, $2, 'message', 'ai', 'whatsapp', $3, $4::jsonb, TRUE)`,
        [req.user.id, `WhatsApp sent: ${contactName || toNumber}`, message.id, JSON.stringify({ toNumber, content })]
      ).catch(() => {});
    }

    res.status(201).json(message);
  } catch (err) {
    console.error("WhatsApp error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to send WhatsApp message.", code: err.code });
  }
}

// ---------------------------------------------------------------
// GET /api/messages?platform=whatsapp&limit=30
// ---------------------------------------------------------------
async function getMessageHistory(req, res) {
  const { platform, limit = 30, skip = 0 } = req.query;

  try {
    let query = "SELECT * FROM messages WHERE user_id = $1";
    const params = [req.user.id];

    if (platform) {
      query += " AND platform = $2";
      params.push(platform);
    }

    query += ` ORDER BY sent_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(skip));

    const result = await pgPool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch messages." });
  }
}

module.exports = { sendSMS, sendWhatsApp, getMessageHistory };
