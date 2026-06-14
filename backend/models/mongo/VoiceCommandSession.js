// ============================================================
// MongoDB Model — Voice Command Session
// ============================================================
const mongoose = require("mongoose");

const voiceCommandSessionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  sessionId: { type: String, required: true, index: true },
  state: {
    type: String,
    enum: ["idle", "listening", "thinking", "awaiting_confirmation", "speaking", "completed", "error"],
    default: "idle",
  },
  lastTranscript: { type: String, default: "" },
  lastIntent: { type: String, default: "" },
  pendingActionId: { type: String, default: "" },
  pendingActionPayload: { type: Object, default: null },
  selectedLanguage: { type: String, default: "auto" },
  selectedVoice: { type: String, default: "" },
  lastToolResult: { type: Object, default: null },
}, { timestamps: true });

voiceCommandSessionSchema.index({ userId: 1, sessionId: 1 }, { unique: true });

module.exports = mongoose.models.VoiceCommandSession || mongoose.model("VoiceCommandSession", voiceCommandSessionSchema);
