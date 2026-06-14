// ============================================================
// Google Routes — /api/google/*
// Translate, Gmail, Maps
// ============================================================
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const { pgPool } = require("../config/database");
const { translateText, detectLanguage, sendGmail, getUnreadEmails, getMapsEmbedUrl } = require("../services/google.service");
const { updateUserGmailTokens } = require("../services/scheduledEmail.service");

router.use(authMiddleware);

// Helper — get user's Google tokens from DB
async function getUserTokens(userId) {
    const res = await pgPool.query("SELECT email, gmail_tokens, gmail_connected_email FROM users WHERE id=$1", [userId]);
    const row = res.rows[0] || {};
    const loginEmail = String(row.email || "").toLowerCase();
    const connectedEmail = String(row.gmail_connected_email || "").toLowerCase();
    if (row.gmail_tokens && connectedEmail && loginEmail && connectedEmail !== loginEmail) {
        const err = new Error(`Connected Gmail ${connectedEmail} does not match Aura login ${loginEmail}. Reconnect Gmail with the same account.`);
        err.code = "GMAIL_ACCOUNT_MISMATCH";
        err.statusCode = 401;
        throw err;
    }
    const raw = row.gmail_tokens;
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
}

// ---------------------------------------------------------------
// POST /api/google/translate
// Body: { text, targetLang }
// ---------------------------------------------------------------
router.post("/translate", async (req, res) => {
    const { text, targetLang = "en" } = req.body;
    if (!text) return res.status(400).json({ error: "text required" });
    try {
        const translated = await translateText(text, targetLang);
        const detected = await detectLanguage(text);
        res.json({ translated, detectedLang: detected, targetLang });
    } catch (err) {
        res.status(500).json({ error: "Translation failed: " + err.message });
    }
});

// ---------------------------------------------------------------
// POST /api/google/detect-language
// Body: { text }
// ---------------------------------------------------------------
router.post("/detect-language", async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "text required" });
    try {
        const lang = await detectLanguage(text);
        res.json({ language: lang });
    } catch (err) {
        res.status(500).json({ error: "Detection failed" });
    }
});

// ---------------------------------------------------------------
// POST /api/google/gmail/send
// Body: { to, subject, body }
// ---------------------------------------------------------------
router.post("/gmail/send", async (req, res) => {
    const { to, subject, body } = req.body;
    if (!to || !subject || !body) return res.status(400).json({ error: "to, subject, body required" });
    try {
        const tokens = await getUserTokens(req.user.id);
        if (!tokens) return res.status(401).json({ error: "Gmail is not connected. Connect Gmail first." });
        const result = await sendGmail(tokens, { to, subject, body }, {
            onTokens: (nextTokens) => updateUserGmailTokens(req.user.id, nextTokens),
        });
        res.json({ success: true, messageId: result.id });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message || "Gmail send failed.", code: err.code || "GMAIL_SEND_FAILED" });
    }
});

// ---------------------------------------------------------------
// GET /api/google/gmail/inbox
// ---------------------------------------------------------------
router.get("/gmail/inbox", async (req, res) => {
    try {
        const tokens = await getUserTokens(req.user.id);
        if (!tokens) return res.status(401).json({ error: "Gmail is not connected." });
        const emails = await getUnreadEmails(tokens, 5);
        res.json(emails);
    } catch (err) {
        res.status(500).json({ error: "Gmail fetch failed: " + err.message });
    }
});

// ---------------------------------------------------------------
// GET /api/google/maps/embed?q=Indore
// ---------------------------------------------------------------
router.get("/maps/embed", (req, res) => {
    const { q = "Indore, Madhya Pradesh" } = req.query;
    const url = getMapsEmbedUrl(q);
    res.json({ url });
});

module.exports = router;
