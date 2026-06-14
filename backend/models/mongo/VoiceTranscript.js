// ============================================================
// MongoDB Model — Voice Transcript
// Stores transcript metadata only. Raw audio is not stored.
// ============================================================
const mongoose = require("mongoose");

const voiceTranscriptSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  sessionId: { type: String, required: true, index: true },
  source: { type: String, enum: ["voice"], default: "voice" },
  finalText: { type: String, required: true },
  detectedLanguage: { type: String, default: "en-IN" },
  confidence: { type: Number, default: null },
  intent: { type: String, default: "unknown_needs_clarification" },
  slots: { type: Object, default: {} },
  toolsUsed: { type: [String], default: [] },
  expiresAt: { type: Date, index: { expires: 0 } },
}, { timestamps: true });

module.exports = mongoose.models.VoiceTranscript || mongoose.model("VoiceTranscript", voiceTranscriptSchema);
