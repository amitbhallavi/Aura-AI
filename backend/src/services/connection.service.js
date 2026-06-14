// ============================================================
// Connection Service — central readiness/status manager
// ============================================================
const { pgPool } = require("../config/database");
const { getProviderStatus } = require("./voice.service");
const { hasConfiguredPhoneConfig } = require("./phoneConfig.service");

function hasAll(...values) {
  return values.every((value) => Boolean(String(value || "").trim()));
}

function service({ connected, label, status, connectUrl = null, explanation = "", ...extra }) {
  return {
    connected: Boolean(connected),
    label,
    status: status || (connected ? "connected" : "not_connected"),
    connectUrl,
    explanation,
    lastSyncAt: new Date().toISOString(),
    ...extra,
  };
}

async function getUserTokens(userId) {
  if (!userId) return {};
  try {
    const result = await pgPool.query(
      "SELECT email, google_tokens, gmail_tokens, gmail_connected_email FROM users WHERE id = $1",
      [userId]
    );
    return result.rows[0] || {};
  } catch {
    return {};
  }
}

async function getConnectionStatus(userId) {
  const tokens = await getUserTokens(userId);
  const voice = getProviderStatus();
  const phoneConfig = await hasConfiguredPhoneConfig(userId);
  const userTwilioReady = phoneConfig.personal || phoneConfig.business;
  const aiProviderReady = hasAll(process.env.GEMINI_API_KEY) || hasAll(process.env.GROQ_API_KEY);
  const loginEmail = String(tokens.email || "").toLowerCase();
  const gmailEmail = String(tokens.gmail_connected_email || "").toLowerCase();
  const gmailAccountMatches = !gmailEmail || !loginEmail || gmailEmail === loginEmail;
  const gmailConnected = Boolean(tokens.gmail_tokens) && gmailAccountMatches;
  const gmailStatus = tokens.gmail_tokens
    ? gmailConnected
      ? (gmailEmail ? "connected" : "connected_unverified")
      : "account_mismatch"
    : "not_connected";
  const gmailExplanation = !tokens.gmail_tokens
    ? "Connect Gmail before sending or scheduling emails."
    : !gmailAccountMatches
      ? `Connected Gmail ${gmailEmail} does not match Aura login ${loginEmail}. Reconnect with the same account.`
      : gmailEmail
        ? `OAuth active for ${gmailEmail}.`
        : "OAuth token is available. Reconnect once to verify it matches your login email.";

  return {
    gemini: service({
      connected: aiProviderReady,
      label: "AI Provider",
      status: aiProviderReady ? "ready" : "not_configured",
      explanation: aiProviderReady
        ? "AI chat is ready. The selected chat model is used per request, with fallback when available."
        : "Configure at least one backend AI key in .env.",
    }),
    gmail: service({
      connected: gmailConnected,
      label: "Gmail",
      status: gmailStatus,
      connectUrl: "/api/gmail/auth-url",
      explanation: gmailExplanation,
      accountEmail: gmailEmail || null,
    }),
    calendar: service({
      connected: Boolean(tokens.google_tokens),
      label: "Google Calendar",
      status: tokens.google_tokens ? "connected" : "not_connected",
      connectUrl: "/api/calendar/auth-url",
      explanation: tokens.google_tokens ? "Calendar OAuth token is available." : "Connect Calendar before creating or changing events.",
    }),
    maps: service({
      connected: hasAll(process.env.GOOGLE_MAPS_API_KEY),
      label: "Google Maps",
      status: hasAll(process.env.GOOGLE_MAPS_API_KEY) ? "connected" : "not_configured",
      explanation: "Requires GOOGLE_MAPS_API_KEY and Places API enabled.",
    }),
    twilioSms: service({
      connected: userTwilioReady,
      label: "SMS",
      status: userTwilioReady ? "connected" : "not_configured",
      explanation: userTwilioReady ? "User Twilio phone config is available." : "Configure a Twilio number in Settings > Phone Config.",
    }),
    twilioWhatsApp: service({
      connected: userTwilioReady,
      label: "WhatsApp",
      status: userTwilioReady ? "connected" : "not_configured",
      explanation: userTwilioReady ? "User Twilio phone config is available. Twilio WhatsApp sandbox or approval is still required." : "Configure a Twilio number in Settings > Phone Config.",
    }),
    twilioCalls: service({
      connected: userTwilioReady,
      label: "AI Calls",
      status: userTwilioReady ? "connected" : "not_configured",
      explanation: userTwilioReady ? "User Twilio phone config is available." : "Configure a Twilio number in Settings > Phone Config.",
    }),
    voice: service({
      connected: Boolean(voice.sttEnabled || voice.fallbackProvider === "browser"),
      label: "Voice Commander",
      status: voice.sttEnabled ? "ready" : "fallback",
      explanation: voice.sttEnabled ? "Cloud STT is ready." : "Browser voice fallback is used.",
    }),
    stt: service({
      connected: Boolean(voice.sttEnabled || voice.fallbackProvider === "browser"),
      label: "Speech-to-Text",
      status: voice.sttEnabled ? "ready" : "browser_ready",
      explanation: voice.sttEnabled
        ? "Backend STT is ready."
        : "Browser speech recognition is ready. Enable Google Cloud Speech-to-Text only if backend transcription is required.",
    }),
    tts: service({
      connected: Boolean(voice.ttsEnabled || voice.fallbackProvider === "browser"),
      label: "Text-to-Speech",
      status: voice.ttsEnabled ? "ready" : "browser_ready",
      explanation: voice.ttsEnabled
        ? "Backend TTS is ready."
        : "Browser speechSynthesis is ready. Enable Google Cloud Text-to-Speech only if backend-generated audio is required.",
    }),
  };
}

function getConnectInstruction(serviceName) {
  const serviceMap = {
    gmail: {
      uiAction: { type: "connect_service", serviceName: "gmail", path: "/api/gmail/auth-url" },
      text: "Gmail connect karne ke liye Connect Gmail button use karo. OAuth ke baad Aura email send/schedule kar paayega.",
    },
    calendar: {
      uiAction: { type: "connect_service", serviceName: "calendar", path: "/api/calendar/auth-url" },
      text: "Google Calendar connect karne ke liye Connect Calendar button use karo. OAuth ke baad Aura events create/list/update kar paayega.",
    },
    maps: {
      uiAction: null,
      text: "Google Maps API-key based service hai. Backend .env me GOOGLE_MAPS_API_KEY add karo aur Places API enable karo.",
    },
    sms: {
      uiAction: { type: "navigate", path: "/settings/phone-config" },
      text: "SMS ke liye Settings > Phone Config me Twilio credentials add karo.",
    },
    whatsapp: {
      uiAction: { type: "navigate", path: "/settings/phone-config" },
      text: "WhatsApp ke liye Settings > Phone Config me Twilio credentials add karo. Twilio WhatsApp sandbox setup bhi required hai.",
    },
    calls: {
      uiAction: { type: "navigate", path: "/settings/phone-config" },
      text: "AI Calls ke liye Settings > Phone Config me Twilio credentials add karo.",
    },
  };
  return serviceMap[String(serviceName || "").toLowerCase()] || {
    uiAction: null,
    text: "Service name clear nahi hai. Dashboard par Connected Services section check karo.",
  };
}

module.exports = {
  getConnectionStatus,
  getConnectInstruction,
};
