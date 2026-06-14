// ============================================================
// Call Controller — schedule, list, cancel AI calls
// ============================================================
const { pgPool } = require("../config/database");
const {
  getTwilioCredentialsForUser,
  normalizePhoneMode,
} = require("../services/phoneConfig.service");

function isWebhookAllowed(req) {
  const secret = String(process.env.TWILIO_WEBHOOK_SECRET || "").trim();
  if (!secret) return true;
  return req.query.secret === secret || req.headers["x-aura-webhook-secret"] === secret;
}

// ---------------------------------------------------------------
// POST /api/calls/schedule
// Body: { phoneNumber, contactName?, purpose?, message?, scheduledAt, language? }
// ---------------------------------------------------------------
async function scheduleCall(req, res) {
  const { phoneNumber, contactName, purpose, message, scheduledAt, language, source, createdByAI, phoneMode, activeMode } = req.body;

  if (!phoneNumber || !scheduledAt) {
    return res.status(400).json({ error: "phoneNumber and scheduledAt are required." });
  }

  // Validate scheduled time is in the future
  if (new Date(scheduledAt) <= new Date()) {
    return res.status(400).json({ error: "Scheduled time must be in the future." });
  }

  try {
    const selectedPhoneMode = normalizePhoneMode(phoneMode || activeMode);
    await getTwilioCredentialsForUser(req.user.id, selectedPhoneMode);

    const result = await pgPool.query(
      `INSERT INTO calls (user_id, phone_number, contact_name, purpose, message, scheduled_at, language, phone_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.user.id,
        phoneNumber,
        contactName || null,
        purpose || "general",
        message || "Hello! This is an automated reminder from AURA.",
        scheduledAt,
        language || "en",
        selectedPhoneMode,
      ]
    );

    const call = result.rows[0];
    if (source === "ai" || createdByAI) {
      await pgPool.query(
        `INSERT INTO tasks (user_id, title, type, remind_at, source, related_service, related_record_id, metadata, created_by_ai)
         VALUES ($1, $2, 'call', $3, 'ai', 'calls', $4, $5::jsonb, TRUE)`,
        [
          req.user.id,
          `Scheduled call: ${contactName || phoneNumber}`,
          scheduledAt,
          call.id,
          JSON.stringify({ phoneNumber, purpose: purpose || "general" }),
        ]
      ).catch(() => {});
    }

    res.status(201).json(call);
  } catch (err) {
    console.error("Schedule call error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to schedule call.", code: err.code });
  }
}

// ---------------------------------------------------------------
// GET /api/calls?status=scheduled&limit=20
// ---------------------------------------------------------------
async function getAllCalls(req, res) {
  const { status, limit = 20, skip = 0 } = req.query;

  try {
    let query = "SELECT * FROM calls WHERE user_id = $1";
    const params = [req.user.id];

    if (status) {
      query += " AND status = $2";
      params.push(status);
    }

    query += ` ORDER BY scheduled_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(skip));

    const result = await pgPool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    // In development, return empty list; in production, return error
    if (process.env.NODE_ENV === "development") {
      console.warn("⚠️  [DEV MODE] PostgreSQL failed for calls, using fallback:", err.message);
      return res.json([]);
    }
    console.error("Call fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch calls." });
  }
}

// ---------------------------------------------------------------
// PATCH /api/calls/:id/cancel
// ---------------------------------------------------------------
async function cancelCall(req, res) {
  try {
    const result = await pgPool.query(
      `UPDATE calls SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status = 'scheduled'
       RETURNING *`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Call not found or already processed." });
    }

    res.json({ message: "Call cancelled.", call: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to cancel call." });
  }
}

// ---------------------------------------------------------------
// POST /api/calls/callback  — Twilio webhook (key press response)
// ---------------------------------------------------------------
async function twilioCallback(req, res) {
  if (!isWebhookAllowed(req)) return res.status(401).send("Unauthorized");

  const { CallSid, Digits } = req.body;

  let twiml = "";
  if (Digits === "1") {
    twiml = `<Response><Say voice="Polly.Aditi" language="hi-IN">Shukriya! Confirmation ho gayi. Aapka din accha rahe!</Say></Response>`;
    // Update call status
    await pgPool.query(
      "UPDATE calls SET status='completed' WHERE twilio_sid=$1",
      [CallSid]
    ).catch(() => {}); // Don't crash if not found
  } else {
    twiml = `<Response><Say voice="Polly.Aditi" language="hi-IN">Theek hai. Hum aapko dobara contact karenge. Dhanyavaad!</Say></Response>`;
  }

  res.set("Content-Type", "text/xml");
  res.send(twiml);
}

module.exports = { scheduleCall, getAllCalls, cancelCall, twilioCallback };
