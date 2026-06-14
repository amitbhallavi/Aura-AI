// ============================================================
// MongoDB Model - User Twilio Phone Configuration
// ============================================================
const mongoose = require("mongoose");

const phoneNumberSlotSchema = new mongoose.Schema({
  twilioSid: { type: String, default: "" },
  twilioToken: { type: String, default: "" },
  twilioPhone: { type: String, default: "" },
}, { _id: false });

const verifiedCallerIdSchema = new mongoose.Schema({
  number: { type: String, required: true },
  sid: { type: String, default: "" },
  friendlyName: { type: String, default: "Personal Number" },
  status: {
    type: String,
    enum: ["pending", "verified"],
    default: "pending",
  },
  phoneMode: {
    type: String,
    enum: ["personal", "business"],
    default: "personal",
  },
  twilioAccountSid: { type: String, default: "" },
  validationCode: { type: String, default: "" },
  callSid: { type: String, default: "" },
  verifiedAt: { type: Date, default: null },
}, { _id: false, timestamps: true });

const phoneConfigSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true, ref: "User" },
  personalNumber: { type: phoneNumberSlotSchema, default: () => ({}) },
  businessNumber: { type: phoneNumberSlotSchema, default: () => ({}) },
  activeMode: {
    type: String,
    enum: ["personal", "business"],
    default: "personal",
  },
  verifiedCallerIds: { type: [verifiedCallerIdSchema], default: [] },
  activeCallerId: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.models.PhoneConfig || mongoose.model("PhoneConfig", phoneConfigSchema);
