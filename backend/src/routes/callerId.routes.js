// ============================================================
// Caller ID Routes - /api/caller-id/*
// ============================================================
const express = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const {
  addNumber,
  listNumbers,
  removeNumber,
  setActive,
  verifyCode,
} = require("../controllers/callerId.controller");

const router = express.Router();

router.use(authMiddleware);

router.post("/add", addNumber);
router.post("/verify", verifyCode);
router.get("/list", listNumbers);
router.delete("/remove", removeNumber);
router.post("/set-active", setActive);

module.exports = router;
