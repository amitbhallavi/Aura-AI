// ============================================================
// Phone Config Routes - /api/phone-config/*
// ============================================================
const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const {
  getPhoneConfig,
  makeOutboundCall,
  phoneTwiml,
  savePhoneConfig,
  setActiveMode,
  sendSMS,
  sendWhatsApp,
  testConnection,
} = require("../controllers/phoneConfig.controller");

const router = express.Router();

router.get("/twiml", phoneTwiml);
router.post("/twiml", phoneTwiml);

router.use(authMiddleware);

router.get("/", getPhoneConfig);
router.post("/save", savePhoneConfig);
router.post("/set-active-mode", setActiveMode);
router.post("/test", testConnection);
router.post("/call", makeOutboundCall);
router.post("/sms", sendSMS);
router.post("/whatsapp", sendWhatsApp);

module.exports = router;
