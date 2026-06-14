// ============================================================
// Call Routes — /api/calls/*
// ============================================================
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const {
  scheduleCall,
  getAllCalls,
  cancelCall,
  twilioCallback,
} = require("../controllers/call.controller");

router.post("/callback", twilioCallback);      // POST   /api/calls/callback (Twilio webhook)

router.use(authMiddleware);
router.post("/schedule", scheduleCall);        // POST   /api/calls/schedule
router.get("/", getAllCalls);                  // GET    /api/calls
router.patch("/:id/cancel", cancelCall);       // PATCH  /api/calls/:id/cancel

module.exports = router;
