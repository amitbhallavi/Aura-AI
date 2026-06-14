// ============================================================
// MongoDB Model — Chat Log
// Stores every conversation exchange for history view
// ============================================================
const mongoose = require("mongoose");

const chatLogSchema = new mongoose.Schema({
  userId:      { type: String, required: true, index: true },
  userMessage: { type: String, required: true },
  aiResponse:  { type: String, required: true },
  language:    { type: String, default: "en" },
  timestamp:   { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model("ChatLog", chatLogSchema);
