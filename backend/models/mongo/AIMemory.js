// ============================================================
// MongoDB Model — AI Memory
// Stores rolling conversation context per user for GPT-4
// ============================================================
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  role:      { type: String, enum: ["user", "assistant"], required: true },
  content:   { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

const aiMemorySchema = new mongoose.Schema({
  userId:    { type: String, required: true, unique: true, index: true },
  messages:  [messageSchema],   // Rolling conversation window (last ~100)
  summary:   { type: String },  // AI-generated summary of older messages
  updatedAt: { type: Date, default: Date.now },
});

// Auto-update updatedAt timestamp on every save
aiMemorySchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("AIMemory", aiMemorySchema);
