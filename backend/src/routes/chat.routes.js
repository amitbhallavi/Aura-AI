// ============================================================
// Chat Routes — /api/chat/*
// ============================================================
const express = require("express");
const multer = require("multer");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const { sendMessage, getHistory, voiceChat, clearMemory } = require("../controllers/chat.controller");

// Store audio in memory (not disk) for voice processing
const upload = multer({ storage: multer.memoryStorage() });

// All chat routes require login
router.use(authMiddleware);

router.post("/message", sendMessage);                      // POST /api/chat/message
router.get("/history", getHistory);                        // GET  /api/chat/history
router.post("/voice", upload.single("audio"), voiceChat);  // POST /api/chat/voice
router.delete("/memory", clearMemory);                     // DELETE /api/chat/memory

module.exports = router;
