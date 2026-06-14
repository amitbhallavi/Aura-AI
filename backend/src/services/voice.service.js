// ============================================================
// Voice Service — STT/TTS adapters + voice sessions
// ============================================================
const crypto = require("crypto");
const VoicePreference = require("../../models/mongo/VoicePreference");
const VoiceTranscript = require("../../models/mongo/VoiceTranscript");
const VoiceCommandSession = require("../../models/mongo/VoiceCommandSession");
const {
  speechToText,
  textToSpeech,
  detectLanguage,
} = require("./openai.service");
const actionConfirmation = require("./actionConfirmation.service");

const DEFAULT_LANG = "en-IN";
const DEFAULT_RETENTION_DAYS = Number(process.env.VOICE_TRANSCRIPT_RETENTION_DAYS || 7);

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null) return fallback;
  return !["false", "0", "off", "no"].includes(String(value).toLowerCase());
}

function normalizeLanguage(language) {
  const value = String(language || "").trim();
  if (!value || value === "auto") return DEFAULT_LANG;
  if (value === "hi") return "hi-IN";
  if (value === "en") return "en-IN";
  if (/^[a-z]{2}-[A-Z]{2}$/.test(value)) return value;
  return value;
}

function toShortLanguage(language) {
  const normalized = normalizeLanguage(language);
  if (normalized.startsWith("hi") || normalized.startsWith("mr") || normalized.startsWith("gu")) return "hi";
  return normalized.split("-")[0] || "en";
}

function getMaxAudioSeconds() {
  return Number(process.env.VOICE_MAX_AUDIO_SECONDS || 60);
}

function getMaxAudioBytes() {
  // WebM/Opus for 60s is usually much smaller. Keep enough room without allowing abuse.
  return Math.max(1, getMaxAudioSeconds()) * 180000;
}

function getProviderStatus() {
  const googleKeyAvailable = Boolean(process.env.GOOGLE_API_KEY);
  return {
    sttEnabled: boolEnv("GOOGLE_STT_ENABLED", true) && googleKeyAvailable,
    ttsEnabled: boolEnv("GOOGLE_TTS_ENABLED", true) && googleKeyAvailable,
    provider: process.env.VOICE_PROVIDER || "google",
    fallbackProvider: process.env.VOICE_FALLBACK_PROVIDER || "browser",
    maxAudioSeconds: getMaxAudioSeconds(),
    maxAudioBytes: getMaxAudioBytes(),
  };
}

async function getVoicePreferences(userId) {
  const existing = await VoicePreference.findOne({ userId }).lean();
  if (existing) return existing;
  return VoicePreference.create({ userId });
}

async function updateVoicePreferences(userId, updates = {}) {
  const allowed = [
    "inputLangMode",
    "preferredInputLangs",
    "preferredTtsProvider",
    "preferredVoiceId",
    "listenMode",
    "autoSpeakReplies",
    "hotwordEnabled",
    "confirmationMode",
    "retentionDays",
  ];
  const safeUpdates = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) safeUpdates[key] = updates[key];
  }
  if (safeUpdates.hotwordEnabled) safeUpdates.hotwordEnabled = false;
  return VoicePreference.findOneAndUpdate(
    { userId },
    { $set: safeUpdates },
    { new: true, upsert: true, runValidators: true }
  ).lean();
}

async function transcribeAudio({ userId, sessionId, audioBuffer, mimeType, language }) {
  const status = getProviderStatus();
  if (!audioBuffer?.length) {
    const err = new Error("Audio file is required.");
    err.statusCode = 400;
    throw err;
  }
  if (!status.sttEnabled) {
    const err = new Error("Cloud voice recognition is not configured. Use browser speech recognition fallback.");
    err.statusCode = 503;
    err.code = "STT_UNAVAILABLE";
    throw err;
  }

  const transcript = await speechToText(audioBuffer, mimeType);
  const cleanTranscript = String(transcript || "").trim();
  if (!cleanTranscript || /could not understand|voice processing failed/i.test(cleanTranscript)) {
    const err = new Error("I could not understand the voice clearly. Please try again or type the command.");
    err.statusCode = 422;
    err.code = "STT_FAILED";
    throw err;
  }

  let detectedLanguage = normalizeLanguage(language);
  try {
    const detected = await detectLanguage(cleanTranscript);
    detectedLanguage = normalizeLanguage(detected);
  } catch {
    detectedLanguage = normalizeLanguage(language);
  }

  await upsertVoiceSession(userId, sessionId, {
    state: "thinking",
    lastTranscript: cleanTranscript,
    selectedLanguage: detectedLanguage,
  });

  return {
    transcript: cleanTranscript,
    detectedLanguage,
    confidence: null,
    provider: "google",
  };
}

async function synthesizeSpeech({ text, language, speakingRate = 1 }) {
  const status = getProviderStatus();
  if (!String(text || "").trim()) {
    const err = new Error("Text is required for speech.");
    err.statusCode = 400;
    throw err;
  }
  if (!status.ttsEnabled) {
    return {
      fallback: true,
      provider: status.fallbackProvider,
      reason: "Browser speechSynthesis is configured for voice playback.",
    };
  }

  const buffer = await textToSpeech(String(text).slice(0, 4000), toShortLanguage(language));
  return {
    audioBuffer: buffer,
    contentType: "audio/mpeg",
    provider: "google",
    speakingRate,
  };
}

async function upsertVoiceSession(userId, sessionId, updates = {}) {
  const safeSessionId = sessionId || crypto.randomUUID();
  return VoiceCommandSession.findOneAndUpdate(
    { userId, sessionId: safeSessionId },
    {
      $set: {
        userId,
        sessionId: safeSessionId,
        ...updates,
      },
    },
    { new: true, upsert: true, runValidators: true }
  ).lean();
}

async function getVoiceSession(userId, sessionId) {
  if (!sessionId) return null;
  return VoiceCommandSession.findOne({ userId, sessionId }).lean();
}

async function saveVoiceTranscript({ userId, sessionId, finalText, detectedLanguage, confidence, intent, toolsUsed = [] }) {
  if (!String(finalText || "").trim()) return null;
  const retentionDays = DEFAULT_RETENTION_DAYS > 0 ? DEFAULT_RETENTION_DAYS : 7;
  const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);
  return VoiceTranscript.create({
    userId,
    sessionId,
    finalText: String(finalText).slice(0, 6000),
    detectedLanguage: normalizeLanguage(detectedLanguage),
    confidence: typeof confidence === "number" ? confidence : null,
    intent: intent || "unknown_needs_clarification",
    toolsUsed,
    expiresAt,
  });
}

async function attachPendingAction({ userId, sessionId, confirmationPayload }) {
  return actionConfirmation.attachPendingAction({ userId, sessionId, confirmationPayload });
}

async function confirmVoiceAction({ userId, sessionId, actionId, decision, editedData }) {
  return actionConfirmation.confirmPendingAction({ userId, sessionId, actionId, decision, editedData });
}

module.exports = {
  getProviderStatus,
  getVoicePreferences,
  updateVoicePreferences,
  transcribeAudio,
  synthesizeSpeech,
  upsertVoiceSession,
  getVoiceSession,
  saveVoiceTranscript,
  attachPendingAction,
  confirmVoiceAction,
  normalizeLanguage,
};
