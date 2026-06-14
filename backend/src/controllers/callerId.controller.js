// ============================================================
// Caller ID Controller - Twilio verified outbound caller IDs
// ============================================================
const {
  addCallerId,
  listCallerIds,
  removeCallerId,
  setActiveCallerId,
  verifyCallerId,
} = require("../services/callerId.service");

function sendError(res, err, fallbackMessage) {
  const statusCode = err.statusCode || err.status || 500;
  if (statusCode >= 500) console.error("Caller ID error:", err.message);
  return res.status(statusCode).json({
    error: err.message || fallbackMessage,
    code: err.code || "CALLER_ID_ERROR",
  });
}

async function addNumber(req, res) {
  try {
    const result = await addCallerId(
      req.user.id,
      req.body.phoneNumber,
      req.body.friendlyName || "Personal Number",
      req.body.phoneMode || req.body.activeMode
    );
    res.status(201).json({
      message: "Caller ID verification started.",
      ...result,
    });
  } catch (err) {
    sendError(res, err, "Failed to start caller ID verification.");
  }
}

async function verifyCode(req, res) {
  try {
    const result = await verifyCallerId(req.user.id, req.body.phoneNumber);
    res.json({
      message: "Caller ID verified.",
      ...result,
    });
  } catch (err) {
    sendError(res, err, "Failed to verify caller ID.");
  }
}

async function listNumbers(req, res) {
  try {
    const result = await listCallerIds(req.user.id);
    res.json(result);
  } catch (err) {
    sendError(res, err, "Failed to list caller IDs.");
  }
}

async function removeNumber(req, res) {
  try {
    const result = await removeCallerId(req.user.id, req.body.callerIdSid || req.body.sid, req.body.phoneNumber);
    res.json({
      message: "Caller ID removed.",
      ...result,
    });
  } catch (err) {
    sendError(res, err, "Failed to remove caller ID.");
  }
}

async function setActive(req, res) {
  try {
    const result = await setActiveCallerId(req.user.id, req.body.phoneNumber);
    res.json({
      message: "Active caller ID updated.",
      ...result,
    });
  } catch (err) {
    sendError(res, err, "Failed to set active caller ID.");
  }
}

module.exports = {
  addNumber,
  listNumbers,
  removeNumber,
  setActive,
  verifyCode,
};
