// ============================================================
// Message Routes — /api/messages/*
// ============================================================
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const { sendSMS, sendWhatsApp, getMessageHistory } = require("../controllers/message.controller");

router.use(authMiddleware);

router.post("/sms", sendSMS);                  // POST /api/messages/sms
router.post("/whatsapp", sendWhatsApp);        // POST /api/messages/whatsapp
router.get("/", getMessageHistory);            // GET  /api/messages

module.exports = router;
