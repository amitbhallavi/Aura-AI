const express = require("express");
const router = express.Router();
const { pgPool } = require("../config/database");

// =============================================
// GET /api/admin/stats
// =============================================
router.get("/stats", async (req, res) => {
  try {
    const totalUsers = await pgPool.query("SELECT COUNT(*) FROM users");
    const proUsers = await pgPool.query("SELECT COUNT(*) FROM users WHERE plan = 'pro'");
    const bannedUsers = await pgPool.query("SELECT COUNT(*) FROM users WHERE is_active = FALSE");
    const totalCalls = await pgPool.query("SELECT COUNT(*) FROM calls");
    const completedCalls = await pgPool.query("SELECT COUNT(*) FROM calls WHERE status = 'completed'");
    const totalTasks = await pgPool.query("SELECT COUNT(*) FROM tasks");
    const totalMessages = await pgPool.query("SELECT COUNT(*) FROM messages");

    // Check which services are connected
    const twilioConnected = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
    const razorpayConnected = !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
    const groqConnected = !!process.env.GROQ_API_KEY;

    res.json({
      totalUsers: parseInt(totalUsers.rows[0].count),
      proUsers: parseInt(proUsers.rows[0].count),
      bannedUsers: parseInt(bannedUsers.rows[0].count),
      totalCalls: parseInt(totalCalls.rows[0].count),
      completedCalls: parseInt(completedCalls.rows[0].count),
      totalTasks: parseInt(totalTasks.rows[0].count),
      totalMessages: parseInt(totalMessages.rows[0].count),
      totalChats: 0,
      integrations: {
        groq: groqConnected,
        twilio: twilioConnected,
        razorpay: razorpayConnected,
        postgres: true,
        mongodb: true,
      }
    });
  } catch (err) {
    console.error("Stats error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// =============================================
// GET /api/admin/users
// =============================================
router.get("/users", async (req, res) => {
  try {
    const result = await pgPool.query(
      "SELECT id, name, email, role, plan, is_active, created_at FROM users ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/users/:id/plan", async (req, res) => {
  try {
    const { plan } = req.body;
    await pgPool.query("UPDATE users SET plan = $1 WHERE id = $2", [plan, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/users/:id/ban", async (req, res) => {
  try {
    await pgPool.query("UPDATE users SET is_active = NOT is_active WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/calls", async (req, res) => {
  try {
    const result = await pgPool.query(
      `SELECT c.*, u.name as user_name FROM calls c LEFT JOIN users u ON c.user_id = u.id ORDER BY c.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/messages", async (req, res) => {
  try {
    const result = await pgPool.query(
      `SELECT m.*, u.name as user_name FROM messages m LEFT JOIN users u ON m.user_id = u.id ORDER BY m.sent_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/tasks", async (req, res) => {
  try {
    const result = await pgPool.query(
      `SELECT t.*, u.name as user_name, u.email as user_email FROM tasks t LEFT JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/chats", async (req, res) => {
  res.json([]);
});

module.exports = router;
