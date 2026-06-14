// ============================================================
// Gmail Routes — /api/gmail/*
// ============================================================
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const { pgPool } = require("../config/database");
const {
  getGmailAuthUrl,
  getGmailTokens,
  getGoogleAccountEmail,
  draftGmailEmail,
  sendGmail,
} = require("../services/google.service");
const {
  getUserGoogleTokens,
  updateUserGmailTokens,
  createScheduledEmail,
  listScheduledEmails,
  updateScheduledEmail,
  cancelScheduledEmail,
} = require("../services/scheduledEmail.service");

router.get("/auth-url", authMiddleware, (req, res) => {
  try {
    res.json({ url: getGmailAuthUrl(req.user.id) });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to start Gmail connection." });
  }
});

router.get("/callback", async (req, res) => {
  const { code, state } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  try {
    if (!code || !state) throw new Error("Missing Gmail OAuth code/state.");
    const tokens = await getGmailTokens(code);
    const userResult = await pgPool.query(
      "SELECT id, email FROM users WHERE id = $1",
      [state]
    );
    const user = userResult.rows[0];
    if (!user) throw new Error("No matching user found for Gmail OAuth state.");

    const connectedEmail = await getGoogleAccountEmail(tokens, "gmail");
    const loginEmail = String(user.email || "").toLowerCase();
    if (!connectedEmail || connectedEmail !== loginEmail) {
      throw new Error(`Connect the same Gmail account as your Aura login: ${loginEmail}. Selected account: ${connectedEmail || "unknown"}.`);
    }

    const result = await pgPool.query(
      "UPDATE users SET gmail_tokens = $1, gmail_connected_email = $2, updated_at = NOW() WHERE id = $3",
      [JSON.stringify(tokens), connectedEmail, state]
    );
    if (result.rowCount === 0) throw new Error("No matching user found for Gmail OAuth state.");
    res.redirect(`${frontendUrl}/chat?gmail=connected`);
  } catch (err) {
    console.error("Gmail OAuth callback error:", err.message);
    res.redirect(`${frontendUrl}/chat?gmail=error&reason=${encodeURIComponent(err.message)}`);
  }
});

router.post("/draft", authMiddleware, (req, res) => {
  const { to, subject, body } = req.body;
  res.json(draftGmailEmail({ to, subject, body }));
});

router.post("/send", authMiddleware, async (req, res) => {
  const { to, subject, body } = req.body;
  if (!to || !subject || !body) return res.status(400).json({ error: "to, subject and body are required." });

  try {
    const tokens = await getUserGoogleTokens(req.user.id);
    if (!tokens) return res.status(401).json({ error: "Gmail is not connected. Connect Gmail first." });
    const result = await sendGmail(tokens, { to, subject, body }, {
      onTokens: (nextTokens) => updateUserGmailTokens(req.user.id, nextTokens),
    });
    res.json({ success: true, messageId: result.id });
  } catch (err) {
    console.error("Gmail send error:", err.message);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to send Gmail email.", code: err.code || "GMAIL_SEND_FAILED" });
  }
});

router.post("/schedule", authMiddleware, async (req, res) => {
  const { to, subject, body, scheduledFor, timezone, recurrence } = req.body;
  if (!to || !subject || !body || !scheduledFor) {
    return res.status(400).json({ error: "to, subject, body and scheduledFor are required." });
  }

  try {
    const scheduledDate = new Date(scheduledFor);
    if (Number.isNaN(scheduledDate.getTime())) return res.status(400).json({ error: "Invalid scheduledFor date." });
    const tokens = await getUserGoogleTokens(req.user.id);
    if (!tokens) return res.status(401).json({ error: "Gmail is not connected. Connect Gmail first." });

    const job = await createScheduledEmail(req.user.id, {
      to,
      subject,
      body,
      scheduledFor: scheduledDate,
      timezone,
      recurrence,
    });
    if (req.body.source === "ai" || req.body.createdByAI) {
      await pgPool.query(
        `INSERT INTO tasks (user_id, title, type, remind_at, source, related_service, related_record_id, metadata, created_by_ai)
         VALUES ($1, $2, 'message', $3, 'ai', 'gmail', $4, $5::jsonb, TRUE)`,
        [req.user.id, `Scheduled email: ${subject}`, scheduledDate, String(job._id), JSON.stringify({ to, subject })]
      ).catch(() => {});
    }
    res.status(201).json(job);
  } catch (err) {
    console.error("Gmail schedule error:", err.message);
    res.status(500).json({ error: "Failed to schedule email." });
  }
});

router.get("/scheduled", authMiddleware, async (req, res) => {
  try {
    const emails = await listScheduledEmails(req.user.id);
    res.json(emails);
  } catch (err) {
    res.status(500).json({ error: "Failed to list scheduled emails." });
  }
});

router.put("/scheduled/:id", authMiddleware, async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.scheduledFor) updates.scheduledFor = new Date(updates.scheduledFor);
    const email = await updateScheduledEmail(req.user.id, req.params.id, updates);
    if (!email) return res.status(404).json({ error: "Pending scheduled email not found." });
    res.json(email);
  } catch (err) {
    res.status(500).json({ error: "Failed to update scheduled email." });
  }
});

router.delete("/scheduled/:id", authMiddleware, async (req, res) => {
  try {
    const email = await cancelScheduledEmail(req.user.id, req.params.id);
    if (!email) return res.status(404).json({ error: "Pending scheduled email not found." });
    res.json(email);
  } catch (err) {
    res.status(500).json({ error: "Failed to cancel scheduled email." });
  }
});

module.exports = router;
