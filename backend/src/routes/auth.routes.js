const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const {
  register,
  login,
  getProfile,
  updateLanguage,
  sendOTP,
  verifyOTP,
  startGoogleAuth,
  handleGoogleAuthCallback,
  startGithubAuth,
  handleGithubAuthCallback,
} = require("../controllers/auth.controller");

router.post("/register", register);
router.post("/login", login);
router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);
router.get("/google", startGoogleAuth);
router.get("/google/callback", handleGoogleAuthCallback);
router.get("/google-login/callback", handleGoogleAuthCallback);
router.get("/github", startGithubAuth);
router.get("/github/callback", handleGithubAuthCallback);

router.get("/profile", authMiddleware, getProfile);
router.patch("/language", authMiddleware, updateLanguage);

module.exports = router;
