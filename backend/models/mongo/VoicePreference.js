// ============================================================
// MongoDB Model — Voice Preferences
// ============================================================
const mongoose = require("mongoose");

const voicePreferenceSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  inputLangMode: { type: String, enum: ["auto", "manual"], default: "auto" },
  preferredInputLangs: { type: [String], default: ["en-IN", "hi-IN"] },
  preferredTtsProvider: { type: String, default: "browser" },
  preferredVoiceId: { type: String, default: "" },
  listenMode: {
    type: String,
    enum: ["press_to_talk", "listen_once", "continuous", "hotword"],
    default: "listen_once",
  },
  autoSpeakReplies: { type: Boolean, default: true },
  hotwordEnabled: { type: Boolean, default: false },
  confirmationMode: { type: String, enum: ["ui_and_voice", "ui_only"], default: "ui_and_voice" },
  retentionDays: { type: Number, default: 7 },
}, { timestamps: true });

module.exports = mongoose.models.VoicePreference || mongoose.model("VoicePreference", voicePreferenceSchema);
