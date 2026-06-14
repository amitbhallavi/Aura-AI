// ============================================================
// AI Message Routes — mounted at /api/ai/generate-message
// ============================================================
const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const { generateMessage } = require("../controllers/aiMessage.controller");

const router = express.Router();

router.post("/", authMiddleware, generateMessage);

module.exports = router;
