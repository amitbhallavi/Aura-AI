const express = require("express");
const {
  handleTwilioCallStatus,
  handleTwilioIncomingMessage,
} = require("../controllers/webhook.controller");

const router = express.Router();

router.post("/twilio/call-status", handleTwilioCallStatus);
router.post("/twilio/messages", handleTwilioIncomingMessage);
router.post("/twilio/message", handleTwilioIncomingMessage);

module.exports = router;
