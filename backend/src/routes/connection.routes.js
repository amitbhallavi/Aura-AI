// ============================================================
// Connection Routes — /api/connections/*
// ============================================================
const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const { getConnectionStatus } = require("../services/connection.service");

const router = express.Router();

router.use(authMiddleware);

router.get("/status", async (req, res) => {
  try {
    const status = await getConnectionStatus(req.user.id);
    res.json(status);
  } catch (err) {
    console.error("Connection status error:", err.message);
    res.status(500).json({ error: "Failed to check service connections." });
  }
});

module.exports = router;
