// ============================================================
// MongoDB Model — Scheduled Email Jobs
// ============================================================
const mongoose = require("mongoose");

const scheduledEmailSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  to: { type: String, required: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  scheduledFor: { type: Date, required: true, index: true },
  timezone: { type: String, default: "Asia/Kolkata" },
  recurrence: {
    type: String,
    enum: ["none", "daily", "weekly", "monthly"],
    default: "none",
  },
  status: {
    type: String,
    enum: ["pending", "sent", "failed", "cancelled"],
    default: "pending",
    index: true,
  },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, default: "" },
  sentAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.models.ScheduledEmail || mongoose.model("ScheduledEmail", scheduledEmailSchema);
