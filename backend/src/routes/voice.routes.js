// ============================================================
// Voice Routes — /api/voice/*
// ============================================================
const express = require("express");
const multer = require("multer");
const authMiddleware = require("../middleware/auth.middleware");
const { createRateLimiter, readPositiveInt } = require("../middleware/rateLimit.middleware");
const {
  confirmVoiceAction,
  getProviderStatus,
  getVoicePreferences,
  synthesizeSpeech,
  transcribeAudio,
  updateVoicePreferences,
} = require("../services/voice.service");

const router = express.Router();
const status = getProviderStatus();
const voiceWorkLimiter = createRateLimiter({
  windowMs: readPositiveInt(process.env.RATE_LIMIT_VOICE_WINDOW_MS, 60 * 1000),
  max: readPositiveInt(process.env.RATE_LIMIT_VOICE_MAX, 30),
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: status.maxAudioBytes,
    files: 1,
  },
});

router.use(authMiddleware);

router.get("/status", (req, res) => {
  res.json(getProviderStatus());
});

router.post("/transcribe", voiceWorkLimiter, upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Audio file is required." });
    const result = await transcribeAudio({
      userId: req.user.id,
      sessionId: req.body.sessionId,
      audioBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      language: req.body.language,
      languageMode: req.body.languageMode,
    });
    res.json(result);
  } catch (err) {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
      error: err.message || "Voice transcription failed.",
      code: err.code || "VOICE_TRANSCRIBE_FAILED",
      fallbackProvider: process.env.VOICE_FALLBACK_PROVIDER || "browser",
    });
  }
});

router.post("/tts", voiceWorkLimiter, async (req, res) => {
  try {
    const result = await synthesizeSpeech({
      text: req.body.text,
      language: req.body.language,
      voiceId: req.body.voiceId,
      speakingRate: req.body.speakingRate,
      speakingStyle: req.body.speakingStyle,
    });

    if (result.audioBuffer) {
      res.setHeader("Content-Type", result.contentType || "audio/mpeg");
      res.setHeader("X-Voice-Provider", result.provider || "google");
      return res.send(result.audioBuffer);
    }

    res.status(202).json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({
      error: err.message || "Voice synthesis failed.",
      fallbackProvider: "browser",
    });
  }
});

router.get("/preferences", async (req, res) => {
  try {
    const preferences = await getVoicePreferences(req.user.id);
    res.json(preferences);
  } catch {
    res.status(500).json({ error: "Failed to load voice preferences." });
  }
});

router.put("/preferences", async (req, res) => {
  try {
    const preferences = await updateVoicePreferences(req.user.id, req.body);
    res.json(preferences);
  } catch (err) {
    res.status(400).json({ error: err.message || "Failed to update voice preferences." });
  }
});

router.post("/confirm-action", async (req, res) => {
  try {
    const { sessionId, actionId, decision, editedData } = req.body;
    if (!sessionId || !actionId) return res.status(400).json({ error: "sessionId and actionId are required." });
    const result = await confirmVoiceAction({
      userId: req.user.id,
      sessionId,
      actionId,
      decision,
      editedData,
    });
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to confirm voice action." });
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: err.code === "LIMIT_FILE_SIZE"
        ? "Audio is too large. Please keep voice commands shorter."
        : "Invalid audio upload.",
      code: err.code,
    });
  }
  next(err);
});

module.exports = router;
