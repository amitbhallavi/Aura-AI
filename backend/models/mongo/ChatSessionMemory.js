const mongoose = require("mongoose");

const memoryMessageSchema = new mongoose.Schema({
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true },
});

const memoryReferenceSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["previous_draft", "previous_location", "previous_task", "previous_message", "tool_result", "pending_action"],
    required: true,
  },
  summary: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  messageId: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now, index: true },
});

const chatSessionMemorySchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  sessionId: { type: String, required: true, index: true },
  messages: [memoryMessageSchema],
  references: [memoryReferenceSchema],
  summary: { type: String, default: "" },
  updatedAt: { type: Date, default: Date.now, index: true },
});

chatSessionMemorySchema.index({ userId: 1, sessionId: 1 }, { unique: true });

chatSessionMemorySchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("ChatSessionMemory", chatSessionMemorySchema);
