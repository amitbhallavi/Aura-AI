// ============================================================
// AI Service — Gemini (primary) + Groq (fallback) + Google STT/TTS
// ============================================================
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Groq = require("groq-sdk");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { google } = require("googleapis");

let geminiClient = null;
let groqClient = null;
let googleAuthClientPromise = null;
let geminiUnavailableReason = "";
let geminiUnavailableLogged = false;
let ttsUnavailableReason = "";
let ttsUnavailableLogged = false;
let sttUnavailableReason = "";
let sttUnavailableLogged = false;

function getGemini() {
  if (!geminiClient) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing in .env");
    geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return geminiClient;
}

function getGroq() {
  if (!groqClient) {
    if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY missing in .env");
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
}

function getPrimaryProvider() {
  return String(process.env.AI_PRIMARY_PROVIDER || process.env.AURA_AI_PROVIDER || "gemini").trim().toLowerCase();
}

function getGroqModel() {
  return process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
}

function normalizeAiSelection(input = {}) {
  const requestedModel = String(input.aiModel || input.model || "").trim().toLowerCase();
  const requestedProvider = String(input.aiProvider || input.provider || "").trim().toLowerCase();
  if (requestedModel === "groq-llama" || requestedProvider === "groq") {
    return {
      key: "groq-llama",
      provider: "groq",
      geminiModel: null,
      groqModel: getGroqModel(),
      label: "Groq Llama",
    };
  }

  if (requestedModel === "gemini-2.5-pro") {
    return {
      key: "gemini-2.5-pro",
      provider: "gemini",
      geminiModel: "gemini-2.5-pro",
      groqModel: getGroqModel(),
      label: "Gemini Pro",
    };
  }

  if (requestedModel === "gemini-2.5-flash" || requestedProvider === "gemini") {
    return {
      key: "gemini-2.5-flash",
      provider: "gemini",
      geminiModel: "gemini-2.5-flash",
      groqModel: getGroqModel(),
      label: "Gemini Flash",
    };
  }

  if (requestedModel === "auto-gemini-flash" || requestedProvider === "auto") {
    return {
      key: "auto-gemini-flash",
      provider: "auto",
      geminiModel: "gemini-2.5-flash",
      groqModel: getGroqModel(),
      label: "Auto: Gemini Flash",
    };
  }

  return {
    key: "auto-gemini-flash",
    provider: "auto",
    geminiModel: "gemini-2.5-flash",
    groqModel: getGroqModel(),
    label: "Auto: Gemini Flash",
  };
}

function shouldTryGemini(selection = normalizeAiSelection()) {
  return selection.provider !== "groq" && Boolean(process.env.GEMINI_API_KEY);
}

function getProviderDisclosureInstruction() {
  return [
    "Provider disclosure rules:",
    "- Never say Gemini is disabled, unavailable, blocked, or not configured.",
    "- Never say you are running on Groq or using Groq as the fallback provider.",
    "- Do not mention provider switching, fallback behavior, API key problems, quota, or backend model routing unless the user explicitly asks about provider/model status.",
    "- If the user asks about provider/model status, answer only from the selected chat model label.",
  ].join("\n");
}

function isProviderStatusQuestion(text) {
  const input = String(text || "").toLowerCase();
  if (!/\b(gemini|groq|provider|model|llama|ai)\b/.test(input)) return false;
  return /(baat|talk|using|use kar|run|running|kaunsa|kaun sa|which|current|currently|kis|kya|are you|tum|aap|disabled|enabled|set hai|selected)/i.test(input);
}

function buildProviderStatusAnswer(selection = normalizeAiSelection(), language = "en") {
  const selected = selection?.label || "Auto: Gemini Flash";
  const isHindi = language === "hi";

  if (selection?.key === "auto-gemini-flash") {
    return isHindi
      ? "Chat abhi Auto: Gemini Flash par set hai. Aura pehle Gemini try karta hai aur sirf zaroorat padne par fallback use karta hai."
      : "Chat is set to Auto: Gemini Flash. Aura tries Gemini first and uses fallback only if needed.";
  }

  return isHindi
    ? `Chat abhi ${selected} par set hai. Aura isi selected model setting ke according response deta hai.`
    : `Chat is set to ${selected}. Aura responds according to the selected model setting.`;
}

function getGoogleApiMessage(err) {
  return String(err?.response?.data?.error?.message || err?.message || err || "");
}

function getGoogleApiReason(err) {
  const details = err?.response?.data?.error?.details || [];
  const reason = details.find((item) => item?.reason)?.reason || "";
  return String(reason || "");
}

function isGooglePermissionFailure(err) {
  const status = err?.response?.status || err?.response?.data?.error?.code;
  const message = getGoogleApiMessage(err);
  const reason = getGoogleApiReason(err);
  return (
    status === 403 ||
    /API_KEY_SERVICE_BLOCKED|PERMISSION_DENIED|SERVICE_DISABLED/i.test(reason) ||
    /blocked|disabled|has not been used|permission_denied|permission denied/i.test(message)
  );
}

function compactGoogleError(err, serviceName) {
  const message = getGoogleApiMessage(err);
  const reason = getGoogleApiReason(err);
  if (/API_KEY_SERVICE_BLOCKED/i.test(reason) || /blocked/i.test(message)) {
    return `${serviceName} is blocked for this API key/project. Check API key restrictions and enable the API in Google Cloud.`;
  }
  if (/has not been used|disabled/i.test(message)) {
    return `${serviceName} API is disabled for the Google Cloud project. Enable it in Google Cloud Console.`;
  }
  if (/PERMISSION_DENIED|permission/i.test(reason + " " + message)) {
    return `${serviceName} permission denied. Check project, billing, enabled APIs, and key restrictions.`;
  }
  return `${serviceName} failed: ${message.slice(0, 220)}`;
}

function markGeminiUnavailableFromError(err) {
  if (!isGooglePermissionFailure(err)) return false;
  geminiUnavailableReason = compactGoogleError(err, "Gemini Generative Language API");
  if (!geminiUnavailableLogged) {
    console.warn(`⚠️  ${geminiUnavailableReason} Falling back to Groq for this request.`);
    geminiUnavailableLogged = true;
  }
  return true;
}

function isGeminiUnavailable() {
  return Boolean(geminiUnavailableReason);
}

function makeProviderUnavailableError(message, code) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 503;
  return error;
}

function resolveGoogleCredentialsPath() {
  const rawPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_SERVICE_ACCOUNT_FILE || "";
  if (!rawPath) return "";
  if (path.isAbsolute(rawPath) && fs.existsSync(rawPath)) return rawPath;

  const candidates = [
    path.resolve(process.cwd(), rawPath),
    path.resolve(__dirname, "../../", rawPath),
    path.resolve(__dirname, "../../../", rawPath),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

async function getGoogleAuthHeaders() {
  const credentialsPath = resolveGoogleCredentialsPath();
  if (!credentialsPath) return null;

  if (!googleAuthClientPromise) {
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    googleAuthClientPromise = auth.getClient();
  }

  const client = await googleAuthClientPromise;
  const headers = await client.getRequestHeaders();
  if (headers && typeof headers.forEach === "function") {
    const plainHeaders = {};
    headers.forEach((value, key) => {
      plainHeaders[key] = value;
    });
    return plainHeaders;
  }
  return headers || null;
}

function markTtsUnavailableFromError(err) {
  if (!isGooglePermissionFailure(err)) return false;
  ttsUnavailableReason = compactGoogleError(err, "Cloud Text-to-Speech");
  if (!ttsUnavailableLogged) {
    console.warn(`⚠️  ${ttsUnavailableReason} Browser speech fallback will be used.`);
    ttsUnavailableLogged = true;
  }
  return true;
}

function markSttUnavailableFromError(err) {
  if (!isGooglePermissionFailure(err)) return false;
  sttUnavailableReason = compactGoogleError(err, "Cloud Speech-to-Text");
  if (!sttUnavailableLogged) {
    console.warn(`⚠️  ${sttUnavailableReason} Voice transcription fallback is unavailable until fixed.`);
    sttUnavailableLogged = true;
  }
  return true;
}

function buildSystemPrompt(language) {
  const isHindi = language === "hi";
  return `You are AURA, an intelligent AI assistant built for Indian users.
You help with scheduling calls, sending WhatsApp/SMS messages, managing tasks, and business automation.
You are powered by Aura's configured AI provider.
${isHindi
      ? "Respond in Hinglish (Hindi + English mix). Be warm, friendly, and conversational. Use common Hindi words naturally."
      : "Respond in clear, concise English. Be helpful and professional."
    }
Never ask the user to configure Gemini unless they specifically ask about Gemini setup.
${getProviderDisclosureInstruction()}`;
}

// ---------------------------------------------------------------
// Main chat function — Gemini primary, Groq fallback
// ---------------------------------------------------------------
async function chat(userId, userMessage, language = "en", options = {}) {
  const systemPrompt = buildSystemPrompt(language);
  const selection = normalizeAiSelection(options);

  if (isProviderStatusQuestion(userMessage)) {
    return buildProviderStatusAnswer(selection, language);
  }

  // Try Gemini first
  if (shouldTryGemini(selection)) {
    try {
      const genAI = getGemini();
      const model = genAI.getGenerativeModel({
        model: selection.geminiModel || process.env.GEMINI_MODEL || "gemini-2.5-flash",
        systemInstruction: systemPrompt,
      });
      const result = await model.generateContent(userMessage);
      const text = result.response.text();
      if (text) return text;
    } catch (err) {
      if (!markGeminiUnavailableFromError(err)) {
        console.warn(`⚠️  Gemini request failed. Falling back to Groq. ${getGoogleApiMessage(err).slice(0, 180)}`);
      }
    }
  }

  // Fallback to Groq
  const client = getGroq();
  const response = await client.chat.completions.create({
    model: selection.groqModel || getGroqModel(),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    max_tokens: 500,
    temperature: 0.7,
  });
  return response.choices[0].message.content;
}

// ---------------------------------------------------------------
// Google Text-to-Speech — Hindi + English
// ---------------------------------------------------------------
async function textToSpeech(text, language = "en") {
  const authHeaders = await getGoogleAuthHeaders().catch((err) => {
    console.warn("⚠️  Google service-account auth failed for TTS:", err.message);
    return null;
  });

  if (!authHeaders && !process.env.GOOGLE_API_KEY) {
    throw makeProviderUnavailableError("Google TTS credentials missing. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_API_KEY.", "TTS_UNAVAILABLE");
  }
  if (ttsUnavailableReason) {
    throw makeProviderUnavailableError(ttsUnavailableReason, "TTS_UNAVAILABLE");
  }

  const isHindi = language === "hi";
  const payload = {
    input: { text },
    voice: {
      languageCode: isHindi ? "hi-IN" : "en-US",
      name: isHindi ? "hi-IN-Wavenet-D" : "en-US-Wavenet-D",
      ssmlGender: "NEUTRAL",
    },
    audioConfig: { audioEncoding: "MP3", speakingRate: 1.0, pitch: 0 },
  };

  try {
    const res = await axios.post(
      authHeaders
        ? "https://texttospeech.googleapis.com/v1/text:synthesize"
        : `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_API_KEY}`,
      payload,
      { timeout: 10000, headers: authHeaders || {} }
    );
    return Buffer.from(res.data.audioContent, "base64");
  } catch (err) {
    if (markTtsUnavailableFromError(err)) {
      throw makeProviderUnavailableError(ttsUnavailableReason, "TTS_UNAVAILABLE");
    }
    console.error("TTS error:", err.response?.data || err.message);
    throw err;
  }
}

// ---------------------------------------------------------------
// Google Speech-to-Text — Hindi + English
// ---------------------------------------------------------------
async function speechToText(audioBuffer, mimeType = "audio/webm") {
  if (!process.env.GOOGLE_API_KEY) {
    return "Voice input received (GOOGLE_API_KEY missing)";
  }
  if (sttUnavailableReason) {
    return "Voice processing failed";
  }

  const audioBase64 = audioBuffer.toString("base64");
  let encoding = "WEBM_OPUS";
  if (mimeType.includes("wav")) encoding = "LINEAR16";
  if (mimeType.includes("ogg")) encoding = "OGG_OPUS";
  if (mimeType.includes("flac")) encoding = "FLAC";

  try {
    const res = await axios.post(
      `https://speech.googleapis.com/v1/speech:recognize?key=${process.env.GOOGLE_API_KEY}`,
      {
        config: {
          encoding,
          sampleRateHertz: 48000,
          languageCode: "hi-IN",
          alternativeLanguageCodes: ["en-US"],
          enableAutomaticPunctuation: true,
        },
        audio: { content: audioBase64 },
      },
      { timeout: 15000 }
    );
    return res.data.results?.[0]?.alternatives?.[0]?.transcript || "Could not understand audio";
  } catch (err) {
    if (!markSttUnavailableFromError(err)) {
      console.error("STT error:", err.response?.data || err.message);
    }
    return "Voice processing failed";
  }
}

// ---------------------------------------------------------------
// Detect language of text
// ---------------------------------------------------------------
async function detectLanguage(text) {
  if (!process.env.GOOGLE_API_KEY) return "en";
  try {
    const res = await axios.post(
      `https://translation.googleapis.com/language/translate/v2/detect?key=${process.env.GOOGLE_API_KEY}`,
      { q: text }
    );
    return res.data.data.detections[0][0].language;
  } catch {
    return "en";
  }
}

module.exports = {
  chat,
  buildProviderStatusAnswer,
  detectLanguage,
  getProviderDisclosureInstruction,
  getGroqModel,
  getPrimaryProvider,
  isGeminiUnavailable,
  isProviderStatusQuestion,
  markGeminiUnavailableFromError,
  normalizeAiSelection,
  speechToText,
  textToSpeech,
};
