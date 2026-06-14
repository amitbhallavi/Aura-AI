// ============================================================
// Calendar Routes — /api/calendar/*
// ============================================================
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const {
  getAuthUrl,
  getTokens,
  addCalendarEvent,
  getUpcomingEvents,
  updateCalendarEvent,
  deleteCalendarEvent,
} = require("../services/calendar.service");
const { pgPool } = require("../config/database");

async function getUserTokens(userId) {
  const userRes = await pgPool.query(
    "SELECT google_tokens FROM users WHERE id = $1",
    [userId]
  );
  const raw = userRes.rows[0]?.google_tokens;
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

// GET /api/calendar/auth-url — Google login URL
router.get("/auth-url", authMiddleware, (req, res) => {
  try {
    const url = getAuthUrl(req.user.id);
    res.json({ url });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to start Calendar connection." });
  }
});

// GET /api/calendar/callback — Google sends code here
router.get("/callback", async (req, res) => {
  const { code, state } = req.query;
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  try {
    if (!code || !state) throw new Error("Missing Calendar OAuth code/state.");
    const tokens = await getTokens(code);
    // Save tokens to DB
    const result = await pgPool.query(
      "UPDATE users SET google_tokens = $1 WHERE id = $2",
      [JSON.stringify(tokens), state]
    );
    if (result.rowCount === 0) throw new Error("No matching user found for Calendar OAuth state.");
    res.redirect(`${frontendUrl}/dashboard?calendar=connected`);
  } catch (err) {
    console.error("Calendar OAuth callback error:", err.message);
    res.redirect(`${frontendUrl}/dashboard?calendar=error&reason=${encodeURIComponent(err.message)}`);
  }
});

// POST /api/calendar/event — Add event
router.post("/event", authMiddleware, async (req, res) => {
  try {
    const tokens = await getUserTokens(req.user.id);
    if (!tokens) {
      return res.status(401).json({ error: "Google Calendar not connected." });
    }
    const event = await addCalendarEvent({ tokens, ...req.body });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: "Failed to add event." });
  }
});

// POST /api/calendar/events — Add event
router.post("/events", authMiddleware, async (req, res) => {
  try {
    const tokens = await getUserTokens(req.user.id);
    if (!tokens) {
      return res.status(401).json({ error: "Google Calendar not connected." });
    }
    const event = await addCalendarEvent({ tokens, ...req.body });
    if (req.body.source === "ai" || req.body.createdByAI) {
      await pgPool.query(
        `INSERT INTO tasks (user_id, title, type, remind_at, source, related_service, related_record_id, metadata, created_by_ai)
         VALUES ($1, $2, 'reminder', $3, 'ai', 'calendar', $4, $5::jsonb, TRUE)`,
        [
          req.user.id,
          `Calendar: ${req.body.title || event.summary || "Event"}`,
          req.body.startTime || null,
          event.id || null,
          JSON.stringify({ eventId: event.id, location: req.body.location || "" }),
        ]
      ).catch(() => {});
    }
    res.status(201).json(event);
  } catch (err) {
    console.error("Calendar create error:", err.message);
    res.status(500).json({ error: "Failed to create calendar event." });
  }
});

// GET /api/calendar/events — Get upcoming events
router.get("/events", authMiddleware, async (req, res) => {
  try {
    const tokens = await getUserTokens(req.user.id);
    if (!tokens) {
      return res.status(401).json({ error: "Google Calendar not connected." });
    }
    const events = await getUpcomingEvents(tokens, {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      maxResults: req.query.maxResults ? Number(req.query.maxResults) : 10,
    });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch events." });
  }
});

router.put("/events/:id", authMiddleware, async (req, res) => {
  try {
    const tokens = await getUserTokens(req.user.id);
    if (!tokens) {
      return res.status(401).json({ error: "Google Calendar not connected." });
    }
    const event = await updateCalendarEvent({
      tokens,
      eventId: req.params.id,
      updates: req.body,
    });
    res.json(event);
  } catch (err) {
    console.error("Calendar update error:", err.message);
    res.status(500).json({ error: "Failed to update calendar event." });
  }
});

router.delete("/events/:id", authMiddleware, async (req, res) => {
  try {
    const tokens = await getUserTokens(req.user.id);
    if (!tokens) {
      return res.status(401).json({ error: "Google Calendar not connected." });
    }
    const result = await deleteCalendarEvent({ tokens, eventId: req.params.id });
    res.json(result);
  } catch (err) {
    console.error("Calendar delete error:", err.message);
    res.status(500).json({ error: "Failed to delete calendar event." });
  }
});

module.exports = router;
