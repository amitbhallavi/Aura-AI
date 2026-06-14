// ============================================================
// Gemini Agent Service — Tool/function calling orchestration
// ============================================================
const { FunctionCallingMode, GoogleGenerativeAI } = require("@google/generative-ai");
const crypto = require("crypto");
const ChatLog = require("../../models/mongo/ChatLog");
const {
  buildProviderStatusAnswer,
  chat: fallbackChat,
  getProviderDisclosureInstruction,
  isProviderStatusQuestion,
  markGeminiUnavailableFromError,
  normalizeAiSelection,
} = require("./openai.service");
const { functionDeclarations, executeTool } = require("./aiToolRegistry.service");
const { pgPool } = require("../config/database");
const {
  getLastDraft,
  getLastLocationResults,
  getPendingAction,
  getRecentMemory,
  getRelevantMemory,
  normalizeSessionId,
  clearPendingActions,
  saveAssistantMessage,
  savePendingAction,
  saveUserMessage,
  summarizeOldMemory,
} = require("./chatMemory.service");
const { preserveMultilineBody } = require("../utils/textFormat");

const SUPPORTED_INTENTS = [
  "general_chat",
  "explain_topic",
  "coding_help",
  "project_help",
  "nearby_place_search",
  "gmail_draft",
  "gmail_send",
  "gmail_schedule",
  "calendar_create",
  "calendar_list",
  "calendar_update",
  "calendar_delete",
  "task_automation",
  "multi_step_task",
  "voice_control",
  "service_status",
  "service_connect",
  "task_create",
  "task_list",
  "call_schedule",
  "call_list",
  "message_send",
  "prompt_helper",
  "form_fill",
  "pricing_action",
  "unknown_needs_clarification",
];

const INTENT_PATTERNS = [
  { intent: "voice_control", test: /(stop speaking|stop voice|speech stop|bolna band|voice band|yes confirm|haan confirm|cancel karo)/i, confidence: 0.96 },
  { intent: "service_status", test: /(service|services|connection|connected|disconnect|status|all services|setup).*(status|batao|check)|all services status/i, confidence: 0.94 },
  { intent: "service_connect", test: /(connect|jodo|setup).*(gmail|calendar|maps|sms|whatsapp|call|voice)|gmail connect|calendar connect/i, confidence: 0.94 },
  { intent: "prompt_helper", test: /(prompt|gemini se|codex|cursor|bolt).*(likh|write|generate|improve|banao|fill|input)/i, confidence: 0.9 },
  { intent: "form_fill", test: /(auto fill|autofill|form fill|input me|page me|section me|fill karo|daal do)/i, confidence: 0.86 },
  { intent: "message_send", test: /(sms|whatsapp|message).*(send|bhej|draft|likh)|bhejo.*(sms|whatsapp|message)/i, confidence: 0.92 },
  { intent: "call_list", test: /(scheduled calls|calls dikhao|call list|meri calls)/i, confidence: 0.88 },
  { intent: "call_schedule", test: /\bcall\b.*(schedule|kal|tomorrow|baje|add|set|karo)|schedule.*\bcall\b/i, confidence: 0.92 },
  { intent: "task_create", test: /(task|reminder).*(add|create|section me|karo|banao)|tasks? section/i, confidence: 0.88 },
  { intent: "task_list", test: /(tasks? dikhao|task list|pending tasks|done tasks)/i, confidence: 0.86 },
  { intent: "pricing_action", test: /(pricing|price|plan|pro plan|enterprise|upgrade|select plan)/i, confidence: 0.86 },
  { intent: "gmail_schedule", test: /(schedule|scheduled|kal|tomorrow).*(email|mail|draft)|(email|mail|draft).*(schedule|scheduled)/i, confidence: 0.94 },
  { intent: "gmail_send", test: /(send|bhej).*(email|mail|draft)|(email|mail|draft).*(send|bhej)/i, confidence: 0.95 },
  { intent: "gmail_draft", test: /(draft|write).*(email|mail)|email.*(draft|write)/i, confidence: 0.88 },
  { intent: "calendar_delete", test: /(delete|cancel).*(calendar|event|meeting)/i, confidence: 0.92 },
  { intent: "calendar_update", test: /(update|reschedule|change).*(calendar|event|meeting)/i, confidence: 0.92 },
  { intent: "calendar_list", test: /(next week|this week|today|tomorrow|calendar).*(list|show|batao|events|schedule)/i, confidence: 0.86 },
  { intent: "calendar_create", test: /(calendar|meeting|reminder|event|schedule).*(add|create|set|schedule|bana|karo)|calendar me/i, confidence: 0.93 },
  { intent: "nearby_place_search", test: /(near me|nearby|aas paas|आस पास|mere aas paas|gym|cafe|hospital|restaurant|shop|shops|store|place batao)/i, confidence: 0.93 },
  { intent: "coding_help", test: /(javascript|python|code|bug|function|programming|closure|react|node|backend|frontend)/i, confidence: 0.85 },
  { intent: "project_help", test: /(project|website|app|startup|product).*(help|plan|build|design|strategy|suggest)/i, confidence: 0.86 },
  { intent: "task_automation", test: /(automate|automation|task automation|workflow|schedule.*task|task.*schedule)/i, confidence: 0.88 },
  { intent: "explain_topic", test: /(explain|samjhao|meaning|kya hota|detail|detail me)/i, confidence: 0.86 },
];

function normalizeResponseMode(responseMode, stepByStepMode = false) {
  if (stepByStepMode) return "step-by-step";
  const normalized = String(responseMode || "normal").toLowerCase();
  if (["step", "steps", "step-by-step"].includes(normalized)) return "step-by-step";
  if (["deep", "deep-explain", "deep_explain", "deep explanation"].includes(normalized)) return "deep-explain";
  if (["quick", "short"].includes(normalized)) return "quick";
  return "normal";
}

function getCurrentIndiaDateContext(baseDate = new Date()) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(baseDate);
}

function buildSystemInstruction(responseMode, language, stepByStepMode, baseDate = new Date()) {
  const languageInstruction = language === "hi"
    ? "Use warm Hinglish with Hindi and English mixed naturally when user writes in Hindi or Hinglish."
    : "Use clear, concise English when the user writes in English.";

  const modeInstruction = {
    normal: "Answer clearly with useful detail, keeping the response professional and helpful.",
    "step-by-step": "Reply with a short summary, a step-by-step plan, the final result, and the next recommended action.",
    "deep-explain": "Explain from basics, use examples, mention why it matters, include common mistakes to avoid, and end with the next action.",
    quick: "Give a short direct answer and avoid extra explanation unless needed.",
  }[responseMode] || "Answer clearly and helpfully.";

  return [
    "You are Aura AI, a real-world assistant for Indian users, powered by Aura's configured AI provider. Do not ask the user to configure Gemini unless they specifically ask about Gemini setup.",
    getProviderDisclosureInstruction(),
    `Current date/time context for India: ${getCurrentIndiaDateContext(baseDate)}. Use this for date/day questions and relative scheduling.`,
    languageInstruction,
    "Act like a serious assistant, not a basic chatbot. Be direct, useful, and specific.",
    "Start with the answer first, then give context, steps, examples, or actions only when useful.",
    "Use clean Markdown: short headings, bullets, numbered steps, code blocks, and compact paragraphs. Do not write giant walls of text.",
    "For coding answers, include working code when useful, explain why it works, and mention common failure points.",
    "For project/product advice, state assumptions, risks, tradeoffs, and the next practical step.",
    "Understand the user's full request, detect intent, and use available tools for real actions.",
    "Classify the request as information, explanation, action, automation, location search, email, calendar, coding help, project help, or general guidance.",
    "If the request is unclear, ask only one smart follow-up question instead of guessing.",
    "Break complex work into simple steps, give the final result, and suggest the next action.",
    "For sensitive changes, require explicit confirmation before sending email, scheduling email, or modifying calendar data.",
    "Never say a sensitive action is completed if it is only prepared for confirmation.",
    "If the user asks what is connected or available, call getConnectionStatus instead of guessing.",
    "When user asks personal account facts, use the provided user profile context and current chat history. Do not invent personal details.",
    "Do not reveal API keys, tokens, or internal system details.",
    "If a tool is available for the task, use the tool instead of only writing text.",
    "Always respect privacy and do not perform actions without the user's approval.",
    `Supported intents: ${SUPPORTED_INTENTS.join(", ")}.`,
    modeInstruction,
    stepByStepMode
      ? "Step-by-Step Mode is active. Follow the step-by-step answer format with numbered steps and a clear result."
      : "Step-by-Step Mode is not active unless response mode requests it.",
  ].join("\n");
}

function polishFinalText(text, language, responseMode, { actionRequired = false, toolUsed = null, aiSelection = null } = {}) {
  const raw = String(text || "").trim();
  if (!raw) return raw;

  if (/Gemini\s+(is\s+)?disabled|Gemini.*unavailable|running on Groq|using Groq|Groq ke AI provider|fallback provider/i.test(raw)) {
    return buildProviderStatusAnswer(aiSelection || normalizeAiSelection(), language);
  }

  if (/GoogleGenerativeAI Error|generativelanguage\.googleapis\.com|Quota exceeded|Too Many Requests|429/i.test(raw)) {
    return language === "hi"
      ? "AI provider me temporary issue aaya. Thoda wait karke dobara try karo ya request ko shorter rakho."
      : "The AI provider had a temporary issue. Wait a bit and try again, or use a shorter request.";
  }

  if (/Gemini API key|configure (the )?Gemini|set up (the )?Gemini|Gemini.*not configured/i.test(raw)) {
    return language === "hi"
      ? "Aura configured AI provider ke saath ready hai. Main available AI aur supported tools ke saath continue karunga."
      : "Aura is already configured with the available AI provider. I will continue with available AI and supported tools.";
  }

  let cleaned = raw
    .replace(/\n{4,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  if (actionRequired && !/confirm|confirmation|approve|review/i.test(cleaned)) {
    cleaned += language === "hi"
      ? "\n\n**Confirmation needed:** Main ye action tabhi complete karunga jab aap confirm karoge."
      : "\n\n**Confirmation needed:** I will complete this action only after you confirm.";
  }

  if (toolUsed && responseMode !== "quick" && !/next step|next recommended|agla step|next action/i.test(cleaned) && cleaned.length > 180) {
    cleaned += language === "hi"
      ? "\n\n**Next step:** Agar aap chahte ho to main is result par next action plan kar sakta hoon."
      : "\n\n**Next step:** Tell me what you want to do with this result next.";
  }

  return cleaned;
}

function getSuggestedNextActions(intent) {
  switch (intent) {
    case "gmail_send":
      return ["Confirm recipient and message", "Review draft before sending"];
    case "gmail_schedule":
      return ["Pick the send time", "Verify email content"];
    case "calendar_create":
      return ["Confirm event details", "Add attendees if needed"];
    case "calendar_list":
      return ["Review your upcoming week", "Ask to add or reschedule events"];
    case "nearby_place_search":
      return ["Choose a place from the list", "Ask for directions or booking details"];
    case "task_automation":
      return ["Review the automation plan", "Confirm the next task step"];
    case "multi_step_task":
      return ["Review planned steps", "Confirm the pending action"];
    case "service_status":
      return ["Open Dashboard", "Connect missing services"];
    case "service_connect":
      return ["Use the Connect button", "Check setup requirements"];
    case "call_schedule":
      return ["Confirm call details", "Add phone number if missing"];
    case "message_send":
      return ["Confirm recipient", "Review message before sending"];
    case "task_create":
      return ["Review created task", "Add reminder time"];
    case "prompt_helper":
      return ["Fill prompt into chat input", "Improve the prompt"];
    case "pricing_action":
      return ["Review plan details", "Confirm before payment"];
    case "coding_help":
      return ["Ask for a code example", "Request the specific problem details"];
    case "project_help":
      return ["Ask for the project goal", "Break work into milestones"];
    case "explain_topic":
      return ["Ask for an example", "Switch to Deep Explain mode"];
    default:
      return ["Ask a follow-up question", "Check if you want help with a real task"];
  }
}

function extractEmail(text) {
  const match = String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0] : null;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasDateOrTime(text) {
  return /\b(\d{1,2}(:\d{2})?\s?(am|pm)|kal|tomorrow|aaj|parson|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}[/-]\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(text);
}

function usesPreviousDraftReference(text) {
  return /(last|same|previous|pichla|pehle wala|same).*draft|draft ko|this draft|send this draft/i.test(text || "");
}

function extractSubject(text) {
  const match = String(text || "").match(/\bsubject\s*[:\-]?\s*([\s\S]*?)(?=\s+\b(body|message|content|saying|that|ki)\b|$)/i);
  return safeSingleLineField(match?.[1]);
}

function extractBody(text) {
  const bodyMatch = String(text || "").match(/\b(?:body|message|content)\s*[:\-]?\s*([\s\S]+)$/i);
  if (bodyMatch?.[1]) return preserveMultilineBody(bodyMatch[1]).trim();
  const sayingMatch = String(text || "").match(/\b(?:saying|that|ki)\s+([\s\S]+)$/i);
  return preserveMultilineBody(sayingMatch?.[1] || "").trim();
}

function safeSingleLineField(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[.。]+$/g, "")
    .trim();
}

function getLatestGmailDetailText(text) {
  const latest = String(text || "").match(/\bNew details:\s*([\s\S]+)$/i);
  return latest?.[1] || text;
}

function cleanGmailTopicCandidate(source) {
  const email = extractEmail(source);
  let value = String(source || "");
  if (email) value = value.replace(new RegExp(escapeRegExp(email), "i"), " ");

  value = value
    .replace(/\b(?:original request|new details|send|sent|bhej|bhejo|email|gmail|mail|draft|write|likh|likho|banao|banakar|client|recipient|topic|subject|please|pls|to|ko|ke liye|ek|one|about|regarding)\b/gi, " ")
    .replace(/\b(?:this|same|previous|last|pichla|pehle wala)\s+draft\b/gi, " ")
    .replace(/^[\s:,\-–—]+|[\s:,\-–—]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (/^(suggest me|suggest|suggestion|suggestions)$/i.test(value)) return "Suggestions";
  return safeSingleLineField(value).slice(0, 180);
}

function extractGmailTopic(text) {
  const raw = String(text || "");
  const latest = raw.match(/\bNew details:\s*([\s\S]+)$/i);
  const original = raw.match(/\bOriginal request:\s*([\s\S]*?)(?=\bNew details:|$)/i);
  const candidates = [latest?.[1], original?.[1], getLatestGmailDetailText(raw), raw].filter(Boolean);

  for (const candidate of candidates) {
    const topic = cleanGmailTopicCandidate(candidate);
    if (topic.length >= 3) return topic;
  }

  return "";
}

function hasUsableGmailTopic(text) {
  const topic = extractGmailTopic(text);
  return topic.length >= 3;
}

function looksLikeRecipientTopic(text) {
  const email = extractEmail(text);
  if (!email) return false;
  const source = String(text || "").trim();
  const startsWithEmail = new RegExp(`^\\s*${escapeRegExp(email)}`, "i").test(source);
  const hasMailCue = /(gmail|email|mail|bhej|send|draft|write|likh|client|topic|subject)/i.test(source);
  return hasUsableGmailTopic(source) && (startsWithEmail || hasMailCue);
}

function titleCaseTopic(topic) {
  return safeSingleLineField(topic)
    .split(" ")
    .filter(Boolean)
    .map((word) => word.length <= 3 ? word : `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function buildSubjectFromTopic(topic) {
  const cleanTopic = safeSingleLineField(topic);
  if (!cleanTopic) return "";
  const subject = /suggest/i.test(cleanTopic) ? "Suggestions" : titleCaseTopic(cleanTopic);
  return subject.length > 78 ? `${subject.slice(0, 75)}...` : subject;
}

function buildTemplateEmailBody(topic, userProfile) {
  const cleanTopic = safeSingleLineField(topic) || "your request";
  const senderName = safeSingleLineField(userProfile?.name || "");
  return [
    "Hi,",
    "",
    `I wanted to reach out regarding ${cleanTopic}.`,
    "",
    "Please review this and let me know your thoughts or the next step.",
    "",
    "Best regards,",
    senderName || "Aura AI",
  ].join("\n");
}

async function generateEmailBodyFromTopic({ userId, topic, to, language, userProfile }) {
  const fallbackBody = buildTemplateEmailBody(topic, userProfile);
  try {
    const prompt = [
      "Write only the email body. Do not include subject, markdown, labels, or explanations.",
      "Keep it professional, clear, and under 140 words.",
      `Recipient: ${to || "client"}`,
      `Topic: ${topic}`,
      `Sender name: ${userProfile?.name || ""}`,
    ].join("\n");
    const generated = await withTimeout(fallbackChat(userId, prompt, language), 8000, "Email body generator");
    const body = preserveMultilineBody(generated || "")
      .replace(/^body\s*:\s*/i, "")
      .replace(/^subject\s*:[^\n]*\n+/i, "")
      .trim();
    if (body.length >= 30 && body.length <= 2500) return body;
  } catch {
    // Deterministic template below keeps Gmail actions usable when the AI provider fails.
  }
  return fallbackBody;
}

async function completeGmailDetailsFromTopic({ userId, text, details, language, userProfile }) {
  const topic = extractGmailTopic(text);
  const next = { ...details };
  if (!next.subject && hasUsableGmailTopic(text)) next.subject = buildSubjectFromTopic(topic);
  if (!next.body && hasUsableGmailTopic(text)) {
    next.body = await generateEmailBodyFromTopic({
      userId,
      topic,
      to: next.to,
      language,
      userProfile,
    });
  }
  return next;
}

function extractGmailDetails(text, fallback = {}) {
  return {
    to: extractEmail(text) || fallback.to || "",
    subject: extractSubject(text) || fallback.subject || "",
    body: extractBody(text) || fallback.body || "",
    tone: fallback.tone || "professional",
  };
}

function isGmailActionIntent(intent) {
  return intent === "gmail_send" || intent === "gmail_schedule";
}

function getMissingGmailFields(intent, details, text) {
  const missing = [];
  const canGenerateFromTopic = hasUsableGmailTopic(text);
  if (!details.to) missing.push("recipient email");
  if (!details.subject && !canGenerateFromTopic) missing.push("subject");
  if (!details.body && !canGenerateFromTopic) missing.push("body");
  if (intent === "gmail_schedule" && !hasDateOrTime(text)) missing.push("send date/time");
  return missing;
}

function buildGmailDetailsQuestion(missing = []) {
  const fields = missing.length ? missing.join(", ") : "recipient email, subject, body";
  return `Email complete karne ke liye ek hi reply me ye details bhejo: ${fields}.`;
}

function getPendingGmailDetails(ref) {
  if (ref?.type !== "pending_action") return null;
  if (ref.data?.kind !== "gmail_missing_details") return null;
  return ref.data;
}

function mergePendingGmailDetails(pending, latestMessage) {
  const intentText = pending.intent === "gmail_schedule" ? "Schedule email" : "Send email";
  return [
    intentText,
    pending.originalMessage ? `Original request: ${pending.originalMessage}` : "",
    `New details: ${latestMessage}`,
  ].filter(Boolean).join("\n");
}

function looksHinglish(text) {
  return /[\u0900-\u097F]|(kya|kaise|mujhe|mere|aas paas|batao|samjhao|karo|kar do|bhej|kal|aaj|ka|ki|ko|hai|nahi)/i.test(text || "");
}

function getIntentGroup(intent) {
  if (intent.startsWith("gmail")) return "gmail";
  if (intent.startsWith("calendar")) return "calendar";
  if (intent === "nearby_place_search") return "places";
  if (intent === "coding_help") return "coding";
  if (intent === "project_help") return "project";
  return intent;
}

function buildPlannedSteps(intent, message, location) {
  const text = String(message || "").toLowerCase();
  const steps = ["Understand the request", "Check missing information"];

  if (intent === "multi_step_task") {
    if (/nearby|aas paas|gym|shop|cafe|hospital|restaurant/.test(text)) steps.push(location ? "Search nearby places" : "Ask for location");
    if (/calendar|meeting|reminder|event/.test(text)) steps.push("Prepare calendar action for confirmation");
    if (/email|mail/.test(text)) steps.push("Draft or schedule email after required details");
    steps.push("Pause before any sensitive action");
    return steps;
  }

  if (intent === "nearby_place_search") return [...steps, location ? "Search Google Places" : "Ask for browser or manual location", "Show place cards"];
  if (intent === "gmail_draft") return [...steps, "Prepare email draft", "Show editable preview"];
  if (intent === "gmail_send") return [...steps, "Prepare email", "Ask confirmation before sending"];
  if (intent === "gmail_schedule") return [...steps, "Prepare scheduled email", "Ask confirmation before scheduling"];
  if (intent === "calendar_create") return [...steps, "Prepare calendar event", "Ask confirmation before creating"];
  if (intent === "calendar_list") return [...steps, "Read calendar events", "Summarize schedule"];
  if (intent === "service_status") return [...steps, "Check service connections", "Show connected and setup-needed services"];
  if (intent === "service_connect") return [...steps, "Identify service", "Return connect action or setup instructions"];
  if (intent === "call_schedule") return [...steps, "Prepare AI call", "Ask confirmation before scheduling"];
  if (intent === "call_list") return [...steps, "Read scheduled calls", "Summarize call list"];
  if (intent === "message_send") return [...steps, "Draft message", "Ask confirmation before sending"];
  if (intent === "task_create") return [...steps, "Create task record", "Show task card"];
  if (intent === "task_list") return [...steps, "Read tasks", "Summarize tasks"];
  if (intent === "prompt_helper") return [...steps, "Generate prompt", "Offer fill/copy action"];
  if (intent === "form_fill") return [...steps, "Prepare safe form fill", "Wait for user review before submit"];
  if (intent === "pricing_action") return [...steps, "Show selected plan", "Require confirmation before payment"];
  if (intent === "coding_help") return [...steps, "Explain with examples", "Point out mistakes to avoid"];
  if (intent === "explain_topic") return [...steps, "Explain clearly", "Give next step"];
  return [...steps, "Answer clearly", "Suggest next step"];
}

function buildActivityTimeline(intent, plannedSteps = [], toolUsed = null) {
  const timeline = ["Understanding your request", "Detecting intent", "Planning response"];
  if (plannedSteps.length) timeline.push("Prepared task steps");
  if (toolUsed) timeline.push(`Used ${toolUsed}`);
  if (intent?.includes("gmail")) timeline.push("Checked Gmail action safety");
  if (intent?.includes("calendar")) timeline.push("Checked calendar action safety");
  if (intent === "nearby_place_search") timeline.push("Checked location search requirements");
  if (intent?.includes("service")) timeline.push("Checked service connections");
  if (intent?.includes("call")) timeline.push("Checked AI Calls safety");
  if (intent?.includes("message")) timeline.push("Checked messaging safety");
  if (intent?.includes("task")) timeline.push("Checked Tasks");
  timeline.push("Prepared final answer");
  return [...new Set(timeline)];
}

async function getUserProfile(userId) {
  try {
    const result = await pgPool.query(
      "SELECT id, name, email, role, language, plan FROM users WHERE id = $1",
      [userId]
    );
    return result.rows[0] || null;
  } catch {
    return null;
  }
}

function isProfileQuestion(text) {
  return /(what'?s my name|what is my name|mera naam|my email|mera email|who am i|main kaun)/i.test(text || "");
}

function parseRelativeDateTime(text, fallbackHour = 9, baseDate = new Date()) {
  const input = String(text || "").toLowerCase();
  const date = new Date(baseDate);

  if (/\b(kal|tomorrow)\b/.test(input)) date.setDate(date.getDate() + 1);
  if (/\b(parson|day after tomorrow)\b/.test(input)) date.setDate(date.getDate() + 2);
  if (/\bnext week\b/.test(input)) date.setDate(date.getDate() + 7);

  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const weekdayIndex = weekdays.findIndex((day) => input.includes(day));
  if (weekdayIndex >= 0) {
    const delta = (weekdayIndex + 7 - date.getDay()) % 7 || 7;
    date.setDate(date.getDate() + delta);
  }

  const timeMatch = input.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/)
    || input.match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:baje|o clock)\b/)
    || input.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\b/)
    || input.match(/\b(?:kal|tomorrow|aaj|today|parson|day after tomorrow|next week)\D{0,40}(\d{1,2})(?::(\d{2}))?\b/)
    || input.match(/\b(\d{1,2})(?::(\d{2}))?\b/);
  const hasDateCue = hasDateOrTime(input) || /\b(baje|o clock|at)\b/i.test(input);
  if (!timeMatch && !hasDateCue) return null;

  let hour = timeMatch ? Number(timeMatch[1]) : fallbackHour;
  const minute = timeMatch?.[2] ? Number(timeMatch[2]) : 0;
  const meridiem = timeMatch?.[3];

  if (!hasDateCue && !meridiem) return null;

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (!meridiem && /baje|o clock/.test(input) && hour >= 1 && hour <= 7) hour += 12;
  if (hour > 23 || minute > 59) return null;

  date.setHours(hour, minute, 0, 0);
  return date;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function detectPlaceQuery(text) {
  const input = String(text || "").toLowerCase();
  if (/gym/.test(input)) return "gym";
  if (/cafe|coffee/.test(input)) return "cafe";
  if (/hospital|doctor|clinic/.test(input)) return "hospital";
  if (/restaurant|food|khana/.test(input)) return "restaurant";
  if (/shop|shops|store/.test(input)) return "shops";
  return "places";
}

function shouldUseDeterministicAction(intent) {
  return new Set([
    "gmail_draft",
    "gmail_send",
    "gmail_schedule",
    "calendar_create",
    "calendar_list",
    "call_schedule",
    "call_list",
    "message_send",
    "task_create",
    "task_list",
    "prompt_helper",
  ]).has(intent);
}

function extractTaskTitle(text) {
  const cleaned = safeSingleLineField(text)
    .replace(/\b(add|create|make|banao|karo|set)\b/gi, "")
    .replace(/\b(task|reminder|todo|to-do|section me|tasks? section)\b/gi, "")
    .replace(/\b(aaj|today|kal|tomorrow|parson|day after tomorrow|next week)\b/gi, "")
    .replace(/\b\d{1,2}(:\d{2})?\s?(am|pm)?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || safeSingleLineField(text).slice(0, 120);
}

function getCalendarListRange(text, baseDate = new Date()) {
  const input = String(text || "").toLowerCase();
  const start = new Date(baseDate);
  start.setHours(0, 0, 0, 0);

  if (/\b(kal|tomorrow)\b/.test(input)) {
    const tomorrow = addDays(start, 1);
    return { startDate: tomorrow.toISOString(), endDate: addDays(tomorrow, 1).toISOString() };
  }

  if (/\bnext week\b/.test(input)) {
    const nextWeek = addDays(start, 7);
    return { startDate: nextWeek.toISOString(), endDate: addDays(nextWeek, 7).toISOString() };
  }

  if (/\b(today|aaj)\b/.test(input)) {
    return { startDate: start.toISOString(), endDate: addDays(start, 1).toISOString() };
  }

  return { startDate: start.toISOString(), endDate: addDays(start, 7).toISOString() };
}

function getFriendlyProviderError(err) {
  const message = String(err?.message || err || "");
  if (/429|quota|too many requests|rate[- ]?limit/i.test(message)) {
    return "AI provider temporarily limited hai. Continue with the best available response.";
  }
  if (/API key|GEMINI_API_KEY/i.test(message)) return "Configured AI provider key missing or invalid hai.";
  return "AI provider response fail hua. Continue with the best available response.";
}

function getFriendlyToolError(err, toolName) {
  const message = String(err?.message || "");
  if (/maps|places|GOOGLE_MAPS_API_KEY/i.test(message)) return "Location search failed. Google Maps API key ya Places API setup check karo, ya manual location try karo.";
  if (/gmail|google\/gmail|not connected/i.test(message)) return "Gmail is not connected yet. Please connect Gmail first.";
  if (/calendar|Google Calendar/i.test(message)) return "Calendar access is required for this action. Please connect Google Calendar first.";
  if (/required/i.test(message)) return message;
  return `${toolName || "Tool"} failed. Please try again with clearer details.`;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

function detectIntent(text) {
  const normalized = String(text || "").trim();
  const matches = INTENT_PATTERNS.filter((pattern) => pattern.test.test(normalized));
  const groups = [...new Set(matches.map((match) => getIntentGroup(match.intent)))];
  const hasMultiStepLanguage = /\b(aur|and|then|phir|uske baad)\b/i.test(normalized);
  const isMultiStep = groups.length > 1 && hasMultiStepLanguage;
  const recipientTopicIntent = looksLikeRecipientTopic(normalized);
  const found = isMultiStep
    ? { intent: "multi_step_task", confidence: 0.92 }
    : matches.sort((a, b) => b.confidence - a.confidence)[0]
      || (recipientTopicIntent ? { intent: "gmail_send", confidence: 0.84 } : null);

  const intent = found ? found.intent : "general_chat";
  const confidence = found ? found.confidence : 0.55;

  let needsClarification = false;
  let clarificationQuestion = "Can you please tell me more about what you want me to do?";

  if (intent === "gmail_send" || intent === "gmail_schedule") {
    const details = extractGmailDetails(normalized);
    const missing = getMissingGmailFields(intent, details, normalized);
    const missingWithoutDraft = usesPreviousDraftReference(normalized)
      ? missing.filter((field) => field !== "recipient email" && field !== "subject" && field !== "body")
      : missing;
    if (missingWithoutDraft.length) {
      needsClarification = true;
      clarificationQuestion = buildGmailDetailsQuestion(missingWithoutDraft);
    }
  }

  if (intent === "gmail_draft" && /to|ko|client/i.test(normalized) && !extractEmail(normalized)) {
    needsClarification = true;
    clarificationQuestion = "Recipient ka email address bata do, phir main draft ready kar dunga.";
  }

  if (intent === "multi_step_task") {
    if (/email|mail/i.test(normalized) && /(send|bhej|schedule|scheduled)/i.test(normalized) && !extractEmail(normalized)) {
      needsClarification = true;
      clarificationQuestion = "Multi-step task ke liye recipient email address bata do. Baaki steps main plan kar lunga.";
    }
    if (/(calendar|meeting|reminder|event)/i.test(normalized) && !hasDateOrTime(normalized)) {
      needsClarification = true;
      clarificationQuestion = "Calendar/reminder ke liye date aur time bata do.";
    }
  }

  if (intent === "calendar_create" || intent === "calendar_update") {
    if (!hasDateOrTime(normalized)) {
      needsClarification = true;
      clarificationQuestion = "Kis date aur time ke liye meeting/calendar event schedule karna hai?";
    }
  }

  if (intent === "calendar_delete") {
    needsClarification = true;
    clarificationQuestion = "Kaunsa calendar event delete karna hai? Agar event details hain to share kijiye.";
  }

  if (!found) {
    if (/help|how to|samjhao|explain|detail/i.test(normalized)) {
      return {
        intent: "explain_topic",
        confidence: 0.70,
        needsClarification: false,
        clarificationQuestion: null,
        suggestedNextActions: getSuggestedNextActions("explain_topic"),
      };
    }
    if (normalized.length < 3) {
      return {
        intent: "unknown_needs_clarification",
        confidence: 0.35,
        needsClarification: true,
        clarificationQuestion: "Aap kya karwana chahte hain? Ek short sentence me bata do.",
        suggestedNextActions: getSuggestedNextActions("unknown_needs_clarification"),
      };
    }
    return {
      intent: "general_chat",
      confidence: 0.60,
      needsClarification: false,
      clarificationQuestion: null,
      suggestedNextActions: getSuggestedNextActions("general_chat"),
    };
  }

  return {
    intent,
    confidence,
    needsClarification,
    clarificationQuestion: needsClarification ? clarificationQuestion : null,
    suggestedNextActions: getSuggestedNextActions(intent),
  };
}

function normalizeHistory(history = []) {
  const normalized = history
    .filter((item) => item?.content)
    .slice(-10)
    .map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: String(item.content).slice(0, 4000) }],
    }));

  while (normalized[0]?.role === "model") normalized.shift();
  return normalized;
}

function compactMemoryReference(ref) {
  return {
    type: ref.type,
    summary: ref.summary,
    messageId: ref.messageId || "",
    createdAt: ref.createdAt,
  };
}

async function getMemoryBundle(userId, sessionId, message) {
  await summarizeOldMemory(userId, sessionId).catch(() => "");
  const [recent, relevant, lastDraft, lastLocation, pendingAction] = await Promise.all([
    getRecentMemory(userId, sessionId, 8).catch(() => []),
    getRelevantMemory(userId, sessionId, message).catch(() => []),
    getLastDraft(userId, sessionId).catch(() => null),
    getLastLocationResults(userId, sessionId).catch(() => null),
    getPendingAction(userId, sessionId).catch(() => null),
  ]);

  const query = String(message || "").toLowerCase();
  const references = [...relevant];
  if (/last draft|same draft|previous draft|pichla draft|pehle wala draft/.test(query) && lastDraft) references.unshift(lastDraft);
  if (/(first|second|third|last|pehla|dusra|teesra|wala|location|place|gym|cafe|shop|directions)/.test(query) && lastLocation) references.unshift(lastLocation);
  if (/confirm|pending|continue|haan|yes/.test(query) && pendingAction) references.unshift(pendingAction);

  const deduped = [];
  const seen = new Set();
  references.forEach((ref) => {
    const key = `${ref.type}:${ref.summary}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(ref);
  });

  const memoryContext = [
    recent.length
      ? `Recent conversation memory:\n${recent.map((msg) => `${msg.role}: ${String(msg.content).slice(0, 900)}`).join("\n")}`
      : "",
    deduped.length
      ? `Relevant memory references:\n${deduped.map((ref, index) => `${index + 1}. ${ref.type}: ${ref.summary}\nData: ${JSON.stringify(ref.data || {}).slice(0, 2500)}`).join("\n")}`
      : "",
  ].filter(Boolean).join("\n\n");

  if (!deduped.length && recent.length) {
    const last = recent[recent.length - 1];
    deduped.push({
      type: "previous_message",
      summary: String(last.content || "").slice(0, 220),
      messageId: last.metadata?.messageId || "",
      createdAt: last.createdAt,
      data: {},
    });
  }

  return {
    memoryContext,
    memoryUsed: recent.length > 0 || deduped.length > 0,
    memoryReferences: deduped.slice(0, 6).map(compactMemoryReference),
  };
}

function getFunctionCalls(response) {
  try {
    return response.functionCalls?.() || [];
  } catch {
    return [];
  }
}

function mergeCards(existing, next) {
  if (!next) return existing;
  if (!existing) return next;
  if (existing.type === next.type) {
    return { type: existing.type, items: [...existing.items, ...next.items] };
  }
  return { type: "mixed", items: [...(existing.items || []), ...(next.items || [])] };
}

function getGenerationConfig(responseMode, voiceMode = false) {
  if (voiceMode || responseMode === "quick") {
    return {
      maxOutputTokens: 320,
      temperature: 0.35,
      topP: 0.85,
    };
  }
  return null;
}

function getModel({ responseMode, language = "en", stepByStepMode = false, allowedFunctionNames = null, baseDate = new Date(), aiSelection = normalizeAiSelection(), voiceMode = false }) {
  if (!process.env.GEMINI_API_KEY) return null;
  if (aiSelection.provider === "groq") return null;

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const normalizedMode = normalizeResponseMode(responseMode, stepByStepMode);
  const systemInstruction = buildSystemInstruction(normalizedMode, language, normalizedMode === "step-by-step", baseDate);
  const generationConfig = getGenerationConfig(normalizedMode, voiceMode);

  const modelConfig = {
    model: aiSelection.geminiModel || process.env.GEMINI_MODEL || "gemini-2.5-flash",
    systemInstruction,
    tools: [{ functionDeclarations }],
  };

  if (generationConfig) modelConfig.generationConfig = generationConfig;

  if (allowedFunctionNames?.length) {
    modelConfig.toolConfig = {
      functionCallingConfig: {
        mode: FunctionCallingMode.ANY,
        allowedFunctionNames,
      },
    };
  }

  return genAI.getGenerativeModel(modelConfig);
}

function getForcedToolNames(message) {
  const text = message.toLowerCase();
  if (/(service|services|connection|connected|disconnect|status|all services|setup).*(status|batao|check)|all services status/i.test(text)) {
    return ["getConnectionStatus"];
  }
  if (/(connect|jodo|setup).*(gmail|calendar|maps|sms|whatsapp|call|voice)|gmail connect|calendar connect/i.test(text)) {
    return ["connectService"];
  }
  if (/(prompt|gemini se|codex|cursor|bolt).*(likh|write|generate|improve|banao|fill|input)/i.test(text)) {
    return ["generatePrompt"];
  }
  if (/(sms|whatsapp|message).*(send|bhej)|bhejo.*(sms|whatsapp|message)/i.test(text)) {
    return /whatsapp/i.test(text) ? ["sendWhatsApp"] : ["sendSMS"];
  }
  if (/\bcall\b.*(schedule|kal|tomorrow|baje|add|set|karo)|schedule.*\bcall\b/i.test(text)) {
    return ["scheduleAICall"];
  }
  if (/(scheduled calls|calls dikhao|call list|meri calls)/i.test(text)) {
    return ["listScheduledCalls"];
  }
  if (/(tasks? dikhao|task list|pending tasks|done tasks)/i.test(text)) {
    return ["listTasks"];
  }
  if (/(task|reminder).*(add|create|section me|karo|banao)|tasks? section/i.test(text)) {
    return ["createTask"];
  }
  if (/(auto fill|autofill|form fill|input me|page me|section me|fill karo|daal do)/i.test(text)) {
    return ["fillCurrentPageForm"];
  }
  if (/(near me|nearby|aas paas|आस पास|mere aas paas|gym|cafe|hospital|restaurant|shop|shops|store|place batao)/i.test(text)) {
    return ["searchNearbyPlaces"];
  }
  if (/(schedule|scheduled|kal|tomorrow).*(email|mail|draft)|(email|mail|draft).*(schedule|scheduled)/i.test(text)) {
    return ["scheduleGmailEmail"];
  }
  if (/(send|bhej).*(email|mail|draft)|(email|mail|draft).*(send|bhej)/i.test(text)) {
    return ["sendGmailEmail"];
  }
  if (/(draft|write).*(email|mail)|email.*(draft|write)/i.test(text)) {
    return ["draftGmailEmail"];
  }
  if (/(calendar|meeting|reminder|event|schedule).*(add|create|set|schedule|bana|karo)|calendar me/i.test(text)) {
    return ["createCalendarEvent"];
  }
  if (/(next week|aaj|today|tomorrow|calendar).*(calendar|events|schedule|batao|list)/i.test(text)) {
    return ["listCalendarEvents"];
  }
  if (/(aur|and).*(calendar|email|meeting|schedule|gym|nearby)/i.test(text)) {
    return ["createTaskPlan"];
  }
  return null;
}

function buildLocalExplanation(message, responseMode, language) {
  const isHi = language === "hi";
  const topic = String(message || "").replace(/deep explain|explain|samjhao|mujhe/gi, "").trim() || "this topic";

  if (/closure/i.test(message)) {
    return isHi
      ? [
          "Summary: JavaScript closure ka matlab hai function apne outer scope ke variables ko yaad rakhta hai, chahe outer function finish ho chuka ho.",
          "",
          "Basics: Jab ek function ke andar dusra function banta hai, inner function outer function ke variables access kar sakta hai. Ye access later bhi kaam karta hai.",
          "",
          "Example:",
          "```js",
          "function counter() {",
          "  let count = 0;",
          "  return function increment() {",
          "    count += 1;",
          "    return count;",
          "  };",
          "}",
          "const next = counter();",
          "next(); // 1",
          "next(); // 2",
          "```",
          "",
          "Why it matters: Closures private state, callbacks, React hooks, event handlers, debounce/throttle, and module patterns me use hote hain.",
          "",
          "Mistakes to avoid: Loop variables ko galat capture karna, unnecessary memory hold karna, aur closure ko magic samajhna. Closure sirf lexical scope ka normal behavior hai.",
          "",
          "Next step: Ek counter, debounce function, aur private variable example khud likho."
        ].join("\n")
      : [
          "Summary: A JavaScript closure is when a function remembers variables from its outer scope even after that outer function has finished.",
          "",
          "Example:",
          "```js",
          "function counter() {",
          "  let count = 0;",
          "  return function increment() {",
          "    count += 1;",
          "    return count;",
          "  };",
          "}",
          "const next = counter();",
          "next(); // 1",
          "next(); // 2",
          "```",
          "",
          "Why it matters: Closures power private state, callbacks, event handlers, React hooks, debounce functions, and module patterns.",
          "",
          "Mistakes to avoid: Capturing the wrong loop variable, holding large objects in memory accidentally, and treating closures as special syntax. They are just lexical scope being preserved.",
          "",
          "Next step: Build a counter and a debounce function using closures."
        ].join("\n");
  }

  if (responseMode === "quick") {
    return isHi
      ? `${topic} ke liye ek direct answer: thoda aur specific context doge to main exact help kar paunga.`
      : `Direct answer for ${topic}: share one specific detail and I can make the answer more exact.`;
  }

  return isHi
    ? [
        `Summary: ${topic} ko samajhne ke liye pehle goal clear karo, phir basic concept, example, aur real use case dekho.`,
        "Steps:",
        "1. Main idea identify karo.",
        "2. Ek simple example dekho.",
        "3. Real project me iska use samjho.",
        "4. Common mistake avoid karo.",
        "Result: Aap concept ko practical tareeke se use kar paoge.",
        "Next step: Apna exact topic ya code snippet bhejo."
      ].join("\n")
    : [
        `Summary: To understand ${topic}, start with the goal, then the basic idea, an example, and a real use case.`,
        "Steps:",
        "1. Identify the core idea.",
        "2. Walk through a simple example.",
        "3. Connect it to a real project use case.",
        "4. Avoid the common mistakes.",
        "Result: You can apply the concept instead of only memorizing it.",
        "Next step: Send the exact topic or code snippet."
      ].join("\n");
}

async function runTextFallback({ userId, message, responseMode, language, providerNote, userProfile, aiSelection }) {
  const fallbackPrompt = [
    providerNote,
    `User profile: ${userProfile ? JSON.stringify({ name: userProfile.name, email: userProfile.email, plan: userProfile.plan }) : "not available"}`,
    `Response mode: ${responseMode}`,
    "Give a helpful real-world assistant answer. Do not mention internal stack traces, provider names, model names, fallback behavior, or API-key setup unless the user explicitly asks.",
    message,
  ].join("\n\n");

  try {
    return await withTimeout(
      fallbackChat(userId, fallbackPrompt, language, aiSelection?.provider === "groq" ? aiSelection : normalizeAiSelection({ aiModel: "groq-llama" })),
      12000,
      "Fallback AI"
    );
  } catch {
    return buildLocalExplanation(message, responseMode, language);
  }
}

function buildResponseEnvelope({
  finalText,
  intentData,
  sessionId = "default",
  messageId = crypto.randomUUID(),
  toolUsed = null,
  toolResult = null,
  actionRequired = false,
  confirmationPayload = null,
  cards = null,
  uiAction = null,
  formFill = null,
  taskCreated = false,
  success = false,
  successType = null,
  successMessage = null,
  createdTask = null,
  relatedRecord = null,
  memoryUsed = false,
  memoryReferences = [],
  plannedSteps = [],
  activityTimeline = null,
  needsClarification = intentData?.needsClarification || false,
  clarificationQuestion = intentData?.clarificationQuestion || null,
}) {
  return {
    ok: true,
    sessionId,
    messageId,
    finalText,
    spokenText: "",
    intent: intentData.intent,
    confidence: intentData.confidence,
    needsClarification,
    clarificationQuestion,
    memoryUsed,
    memoryReferences,
    toolUsed,
    toolResult,
    actionRequired,
    confirmationPayload,
    uiAction,
    formFill,
    taskCreated,
    success,
    successType,
    successMessage,
    createdTask,
    relatedRecord,
    cards,
    suggestedNextActions: intentData.suggestedNextActions,
    plannedSteps,
    activityTimeline: activityTimeline || buildActivityTimeline(intentData.intent, plannedSteps, toolUsed),
    error: null,
  };
}

async function maybeHandleDirectAction({ userId, sessionId, message, intentData, location, responseMode, language, userProfile, baseDate = new Date(), aiSelection = normalizeAiSelection() }) {
  const text = String(message || "");
  const plannedSteps = buildPlannedSteps(intentData.intent, message, location);

  if (isProviderStatusQuestion(text)) {
    return buildResponseEnvelope({
      finalText: buildProviderStatusAnswer(aiSelection, language),
      intentData: {
        ...intentData,
        needsClarification: false,
        clarificationQuestion: null,
      },
      plannedSteps: ["Read selected chat model", "Answered provider status from selector"],
    });
  }

  if (isProfileQuestion(text)) {
    const name = userProfile?.name || "I do not have your profile name in this session.";
    const email = userProfile?.email ? ` Your login email is ${userProfile.email}.` : "";
    const finalText = language === "hi"
      ? `Aapka Aura profile name ${name} hai.${email}`
      : `Your Aura profile name is ${name}.${email}`;
    return buildResponseEnvelope({ finalText, intentData, plannedSteps });
  }

  if (intentData.needsClarification) {
    let finalText = intentData.clarificationQuestion;
    if (isGmailActionIntent(intentData.intent)) {
      const details = extractGmailDetails(message);
      const missing = getMissingGmailFields(intentData.intent, details, message);
      finalText = buildGmailDetailsQuestion(missing);
      await savePendingAction(userId, sessionId, {
        kind: "gmail_missing_details",
        intent: intentData.intent,
        originalMessage: message,
        missingFields: missing,
        summary: `Pending Gmail ${intentData.intent === "gmail_schedule" ? "schedule" : "send"} details: ${missing.join(", ")}`,
      }).catch(() => {});
    }
    return buildResponseEnvelope({
      finalText,
      intentData: { ...intentData, clarificationQuestion: finalText },
      plannedSteps,
      needsClarification: true,
      clarificationQuestion: finalText,
    });
  }

  if (intentData.intent === "service_status") {
    const execution = await executeTool({ name: "getConnectionStatus", args: {}, userId });
    const services = Object.values(execution.result.services || {});
    const ready = services.filter((item) => item.connected).length;
    const total = services.length;
    const finalText = language === "hi"
      ? `${ready}/${total} services ready hain. Jo disconnected/setup-needed services hain unke cards me next step dekh lo.`
      : `${ready}/${total} services are ready. Review the cards for disconnected or setup-needed services.`;
    return buildResponseEnvelope({
      finalText,
      intentData,
      toolUsed: "getConnectionStatus",
      toolResult: execution.result,
      cards: execution.cards,
      plannedSteps,
    });
  }

  if (intentData.intent === "service_connect") {
    const serviceMatch = text.match(/gmail|calendar|maps|sms|whatsapp|calls?|voice/i);
    const serviceName = serviceMatch?.[0]?.replace(/call/i, "calls") || "service";
    const execution = await executeTool({ name: "connectService", args: { serviceName }, userId });
    return buildResponseEnvelope({
      finalText: execution.result.message,
      intentData,
      toolUsed: "connectService",
      toolResult: execution.result,
      cards: execution.cards,
      uiAction: execution.uiAction,
      plannedSteps,
    });
  }

  if (intentData.intent === "pricing_action") {
    const plan = /enterprise/i.test(text) ? "enterprise" : /pro/i.test(text) ? "pro" : "pricing";
    return buildResponseEnvelope({
      finalText: language === "hi"
        ? `${plan} plan select karne se pehle pricing page par details review karo. Payment ya plan change confirmation ke bina nahi hoga.`
        : `Review the ${plan} plan on the Pricing page first. No payment or plan change will happen without confirmation.`,
      intentData,
      toolUsed: null,
      toolResult: null,
      uiAction: { type: "open_page", path: "/pricing", selectPlan: plan },
      plannedSteps,
    });
  }

  if (intentData.intent === "nearby_place_search") {
    if (!location?.latitude && !location?.locationText) {
      const finalText = language === "hi"
        ? "Nearby places search ke liye location chahiye. Browser location allow karo ya area/city manually bata do."
        : "I need your location for nearby search. Allow browser location or enter your area/city manually.";
      return buildResponseEnvelope({
        finalText,
        intentData: { ...intentData, needsClarification: true, clarificationQuestion: finalText },
        plannedSteps,
        needsClarification: true,
        clarificationQuestion: finalText,
      });
    }

    try {
      const execution = await executeTool({
        name: "searchNearbyPlaces",
        args: {
          query: detectPlaceQuery(message),
          latitude: location.latitude,
          longitude: location.longitude,
          locationText: location.locationText,
          radius: 3000,
        },
        userId,
      });
      const count = execution.result?.places?.length || 0;
      const finalText = language === "hi"
        ? `Aapke aas paas ${detectPlaceQuery(message)} ke ${count} results mile. Cards me top options dekh lo.`
        : `I found ${count} nearby ${detectPlaceQuery(message)} results. Review the cards for the best options.`;
      return buildResponseEnvelope({
        finalText,
        intentData,
        toolUsed: "searchNearbyPlaces",
        toolResult: execution.result,
        cards: execution.cards,
        plannedSteps,
      });
    } catch (err) {
      return buildResponseEnvelope({
        finalText: getFriendlyToolError(err, "searchNearbyPlaces"),
        intentData,
        toolUsed: "searchNearbyPlaces",
        toolResult: { error: getFriendlyToolError(err, "searchNearbyPlaces") },
        plannedSteps,
      });
    }
  }

  return null;
}

async function runDeterministicFallbackAction({ userId, sessionId = "default", message, intentData, location, responseMode, language, userProfile, providerNote, baseDate = new Date(), aiSelection, clientContext = null }) {
  const plannedSteps = buildPlannedSteps(intentData.intent, message, location);
  const text = String(message || "");

  if (intentData.intent === "multi_step_task" && /gym|nearby|aas paas/i.test(text) && /(calendar|reminder|event)/i.test(text)) {
    let placesExecution = null;
    if (location?.latitude || location?.locationText) {
      try {
        placesExecution = await executeTool({
          name: "searchNearbyPlaces",
          args: {
            query: detectPlaceQuery(text),
            latitude: location.latitude,
            longitude: location.longitude,
            locationText: location.locationText,
            radius: 3000,
          },
          userId,
        });
      } catch {
        placesExecution = null;
      }
    }

    const start = parseRelativeDateTime(text, 7, baseDate) || addMinutes(new Date(baseDate), 60);
    const calendarExecution = await executeTool({
      name: "createCalendarEvent",
      args: {
        title: "Gym reminder",
        startTime: start.toISOString(),
        endTime: addMinutes(start, 30).toISOString(),
        description: "Gym reminder created from Aura AI chat.",
        attendees: [],
      },
      userId,
    });

    return buildResponseEnvelope({
      finalText: language === "hi"
        ? "Maine gym search step prepare kiya aur calendar reminder ready kar diya. Reminder add karne ke liye confirmation chahiye."
        : "I prepared the gym search step and a calendar reminder. Confirm before I add the reminder.",
      intentData,
      toolUsed: placesExecution ? "searchNearbyPlaces + createCalendarEvent" : "createCalendarEvent",
      toolResult: {
        places: placesExecution?.result?.places || [],
        calendar: calendarExecution.result,
        providerNote,
      },
      cards: placesExecution?.cards || null,
      actionRequired: true,
      confirmationPayload: calendarExecution.confirmationPayload,
      plannedSteps,
    });
  }

  if (["gmail_send", "gmail_schedule", "gmail_draft"].includes(intentData.intent)) {
    const previousDraft = usesPreviousDraftReference(text)
      ? await getLastDraft(userId, sessionId).catch(() => null)
      : null;
    const draft = await completeGmailDetailsFromTopic({
      userId,
      text,
      details: extractGmailDetails(text, previousDraft?.data || {}),
      language,
      userProfile,
    });
    const missing = intentData.intent === "gmail_draft"
      ? getMissingGmailFields("gmail_send", draft, text)
      : getMissingGmailFields(intentData.intent, draft, text);

    if (missing.length) {
      const question = buildGmailDetailsQuestion(missing);
      await savePendingAction(userId, sessionId, {
        kind: "gmail_missing_details",
        intent: intentData.intent,
        originalMessage: text,
        missingFields: missing,
        summary: `Pending Gmail ${intentData.intent === "gmail_schedule" ? "schedule" : "send"} details: ${missing.join(", ")}`,
      }).catch(() => {});
      return buildResponseEnvelope({
        finalText: question,
        intentData: { ...intentData, needsClarification: true, clarificationQuestion: question },
        plannedSteps,
        needsClarification: true,
        clarificationQuestion: question,
      });
    }

    const toolName = intentData.intent === "gmail_schedule"
      ? "scheduleGmailEmail"
      : intentData.intent === "gmail_send"
        ? "sendGmailEmail"
        : "draftGmailEmail";
    const args = intentData.intent === "gmail_schedule"
      ? { ...draft, dateTime: (parseRelativeDateTime(text, 10, baseDate) || addMinutes(new Date(baseDate), 60)).toISOString(), timezone: "Asia/Kolkata", recurrence: "none" }
      : draft;
    const execution = await executeTool({ name: toolName, args, userId });

    return buildResponseEnvelope({
      finalText: intentData.intent === "gmail_draft"
        ? "Email draft ready hai. Preview check kar lo."
        : intentData.intent === "gmail_schedule"
          ? "Email schedule ready hai. Modal me ek baar confirm karo, phir schedule ho jayega."
          : "Email ready hai. Modal me ek baar confirm karo, phir send ho jayega.",
      intentData,
      toolUsed: toolName,
      toolResult: execution.result,
      cards: execution.cards,
      actionRequired: Boolean(execution.actionRequired),
      confirmationPayload: execution.confirmationPayload,
      plannedSteps,
    });
  }

  if (intentData.intent === "calendar_create") {
    const start = parseRelativeDateTime(text, 17, baseDate);
    if (!start) {
      return buildResponseEnvelope({
        finalText: "Kis date aur time ke liye meeting/calendar event schedule karna hai?",
        intentData: { ...intentData, needsClarification: true, clarificationQuestion: "Kis date aur time ke liye meeting/calendar event schedule karna hai?" },
        plannedSteps,
        needsClarification: true,
        clarificationQuestion: "Kis date aur time ke liye meeting/calendar event schedule karna hai?",
      });
    }
    const execution = await executeTool({
      name: "createCalendarEvent",
      args: {
        title: /gym/i.test(text) ? "Gym reminder" : /meeting/i.test(text) ? "Meeting" : "Calendar event",
        startTime: start.toISOString(),
        endTime: addMinutes(start, 60).toISOString(),
        description: "Created from Aura AI chat.",
        attendees: [],
      },
      userId,
    });
    return buildResponseEnvelope({
      finalText: "Calendar event ready hai. Add karne se pehle confirmation chahiye.",
      intentData,
      toolUsed: "createCalendarEvent",
      toolResult: execution.result,
      actionRequired: true,
      confirmationPayload: execution.confirmationPayload,
      plannedSteps,
    });
  }

  if (intentData.intent === "call_schedule") {
    const phone = text.match(/\+?\d[\d\s\-()]{7,}/)?.[0];
    const start = parseRelativeDateTime(text, 17, baseDate);
    if (!phone || !start) {
      return buildResponseEnvelope({
        finalText: !phone ? "Call schedule karne ke liye phone number bata do." : "Call kis date aur time par schedule karni hai?",
        intentData: { ...intentData, needsClarification: true, clarificationQuestion: !phone ? "Call schedule karne ke liye phone number bata do." : "Call kis date aur time par schedule karni hai?" },
        plannedSteps,
        needsClarification: true,
        clarificationQuestion: !phone ? "Call schedule karne ke liye phone number bata do." : "Call kis date aur time par schedule karni hai?",
      });
    }
    const execution = await executeTool({
      name: "scheduleAICall",
      args: {
        phoneNumber: phone,
        contactName: text.match(/rahul|client|customer/i)?.[0] || "",
        purpose: /support/i.test(text) ? "support" : /follow/i.test(text) ? "follow_up" : /reminder/i.test(text) ? "reminder" : "general",
        scheduledAt: start.toISOString(),
        message: "Hello! This is an automated reminder from AURA.",
      },
      userId,
    });
    return buildResponseEnvelope({
      finalText: "AI call ready hai. Schedule karne ke liye confirmation chahiye.",
      intentData,
      toolUsed: "scheduleAICall",
      toolResult: execution.result,
      actionRequired: true,
      confirmationPayload: execution.confirmationPayload,
      plannedSteps,
    });
  }

  if (intentData.intent === "message_send") {
    const phone = text.match(/\+?\d[\d\s\-()]{7,}/)?.[0];
    if (!phone) {
      return buildResponseEnvelope({
        finalText: "Message bhejne ke liye recipient ka phone number bata do.",
        intentData: { ...intentData, needsClarification: true, clarificationQuestion: "Message bhejne ke liye recipient ka phone number bata do." },
        plannedSteps,
        needsClarification: true,
        clarificationQuestion: "Message bhejne ke liye recipient ka phone number bata do.",
      });
    }
    const messageMatch = text.match(/(?:ki|that)\s+(.+)$/i);
    const content = messageMatch?.[1] || "Meeting reminder from Aura AI.";
    const toolName = /whatsapp/i.test(text) ? "sendWhatsApp" : "sendSMS";
    const execution = await executeTool({
      name: toolName,
      args: { phoneNumber: phone, message: content, contactName: text.match(/rahul|client|customer/i)?.[0] || "" },
      userId,
    });
    return buildResponseEnvelope({
      finalText: `${/whatsapp/i.test(text) ? "WhatsApp" : "SMS"} draft ready hai. Send karne ke liye confirmation chahiye.`,
      intentData,
      toolUsed: toolName,
      toolResult: execution.result,
      actionRequired: true,
      confirmationPayload: execution.confirmationPayload,
      plannedSteps,
    });
  }

  if (intentData.intent === "call_list") {
    try {
      const execution = await executeTool({ name: "listScheduledCalls", args: {}, userId });
      const count = execution.result?.calls?.length || 0;
      return buildResponseEnvelope({
        finalText: language === "hi"
          ? `${count} calls mile. Cards me recent scheduled calls dekh lo.`
          : `I found ${count} calls. Review the recent scheduled calls in the cards.`,
        intentData,
        toolUsed: "listScheduledCalls",
        toolResult: execution.result,
        cards: execution.cards,
        plannedSteps,
      });
    } catch (err) {
      return buildResponseEnvelope({
        finalText: getFriendlyToolError(err, "listScheduledCalls"),
        intentData,
        toolUsed: "listScheduledCalls",
        toolResult: { error: getFriendlyToolError(err, "listScheduledCalls") },
        plannedSteps,
      });
    }
  }

  if (intentData.intent === "task_list") {
    const filter = /done|completed|complete/i.test(text) ? "done" : /pending|open|todo/i.test(text) ? "pending" : "all";
    try {
      const execution = await executeTool({ name: "listTasks", args: { filter }, userId });
      const count = execution.result?.tasks?.length || 0;
      return buildResponseEnvelope({
        finalText: language === "hi"
          ? `${filter} filter ke saath ${count} tasks mile.`
          : `I found ${count} tasks with the ${filter} filter.`,
        intentData,
        toolUsed: "listTasks",
        toolResult: execution.result,
        cards: execution.cards,
        plannedSteps,
      });
    } catch (err) {
      return buildResponseEnvelope({
        finalText: getFriendlyToolError(err, "listTasks"),
        intentData,
        toolUsed: "listTasks",
        toolResult: { error: getFriendlyToolError(err, "listTasks") },
        plannedSteps,
      });
    }
  }

  if (intentData.intent === "task_create") {
    const title = extractTaskTitle(text);
    if (!title || title.length < 3) {
      const question = language === "hi" ? "Task ka exact title bata do." : "Tell me the exact task title.";
      return buildResponseEnvelope({
        finalText: question,
        intentData: { ...intentData, needsClarification: true, clarificationQuestion: question },
        plannedSteps,
        needsClarification: true,
        clarificationQuestion: question,
      });
    }

    try {
      const remindAt = parseRelativeDateTime(text, 9, baseDate);
      const execution = await executeTool({
        name: "createTask",
        args: {
          title,
          type: /call/i.test(text) ? "call" : /message|sms|whatsapp|email|mail/i.test(text) ? "message" : /reminder/i.test(text) ? "reminder" : "general",
          remindAt: remindAt ? remindAt.toISOString() : "",
          relatedService: "",
        },
        userId,
      });
      const task = execution.result?.task;
      return buildResponseEnvelope({
        finalText: language === "hi"
          ? `Task add ho gaya: ${task?.title || title}.`
          : `Task added: ${task?.title || title}.`,
        intentData,
        toolUsed: "createTask",
        toolResult: execution.result,
        cards: execution.cards,
        taskCreated: true,
        success: true,
        successType: "task_created",
        successMessage: task?.title ? `Task added: ${task.title}` : "Task added successfully.",
        createdTask: task || null,
        relatedRecord: task || null,
        plannedSteps,
      });
    } catch (err) {
      return buildResponseEnvelope({
        finalText: getFriendlyToolError(err, "createTask"),
        intentData,
        toolUsed: "createTask",
        toolResult: { error: getFriendlyToolError(err, "createTask") },
        plannedSteps,
      });
    }
  }

  if (intentData.intent === "calendar_list") {
    try {
      const execution = await executeTool({
        name: "listCalendarEvents",
        args: getCalendarListRange(text, baseDate),
        userId,
      });
      const count = execution.result?.events?.length || 0;
      return buildResponseEnvelope({
        finalText: language === "hi"
          ? `${count} calendar events mile. Cards me schedule dekh lo.`
          : `I found ${count} calendar events. Review your schedule in the cards.`,
        intentData,
        toolUsed: "listCalendarEvents",
        toolResult: execution.result,
        cards: execution.cards,
        plannedSteps,
      });
    } catch (err) {
      return buildResponseEnvelope({
        finalText: getFriendlyToolError(err, "listCalendarEvents"),
        intentData,
        toolUsed: "listCalendarEvents",
        toolResult: { error: getFriendlyToolError(err, "listCalendarEvents") },
        plannedSteps,
      });
    }
  }

  if (intentData.intent === "prompt_helper") {
    try {
      const targetTool = text.match(/codex|chatgpt|gemini|cursor|bolt/i)?.[0] || "AI tool";
      const execution = await executeTool({
        name: "generatePrompt",
        args: {
          userGoal: text,
          targetTool,
          tone: language === "hi" ? "direct, practical, Hinglish-friendly" : "direct, practical, production-ready",
          constraints: "Ask only necessary questions, give exact next steps, avoid vague advice.",
        },
        userId,
      });
      return buildResponseEnvelope({
        finalText: language === "hi"
          ? "Prompt ready hai. Maine chat input me fill karne ka action bhi prepare kar diya."
          : "Prompt ready. I also prepared an action to fill it into the chat input.",
        intentData,
        toolUsed: "generatePrompt",
        toolResult: execution.result,
        cards: execution.cards,
        uiAction: execution.uiAction,
        plannedSteps,
      });
    } catch (err) {
      return buildResponseEnvelope({
        finalText: getFriendlyToolError(err, "generatePrompt"),
        intentData,
        toolUsed: "generatePrompt",
        toolResult: { error: getFriendlyToolError(err, "generatePrompt") },
        plannedSteps,
      });
    }
  }

  if (intentData.intent === "form_fill") {
    const page = clientContext?.currentPage || clientContext?.pageContext?.currentPage || "/chat";
    const execution = await executeTool({
      name: "fillCurrentPageForm",
      args: {
        page,
        fields: "{}",
      },
      userId,
    });
    return buildResponseEnvelope({
      finalText: language === "hi"
        ? "Form fill action prepare ho gaya. Submit karne se pehle review zaroor karo."
        : "Form fill action is prepared. Review it before submitting.",
      intentData,
      toolUsed: "fillCurrentPageForm",
      toolResult: execution.result,
      formFill: execution.formFill,
      plannedSteps,
    });
  }

  const textFallback = await runTextFallback({ userId, message, responseMode, language, providerNote, userProfile, aiSelection });
  return buildResponseEnvelope({
    finalText: textFallback,
    intentData,
    plannedSteps,
    activityTimeline: [...buildActivityTimeline(intentData.intent, plannedSteps), "Used fallback answer mode"],
  });
}

async function runAgentChat({ userId, message, history = [], voiceMode = false, responseMode = "normal", stepByStepMode = false, location = null, language = null, clientContext = null, sessionId = null, aiProvider = null, aiModel = null }) {
  if (!message?.trim()) throw new Error("message is required");

  const safeSessionId = normalizeSessionId(sessionId || clientContext?.sessionId || "default");
  const messageId = crypto.randomUUID();
  const rawMessage = preserveMultilineBody(message);
  const pendingGmailDetails = getPendingGmailDetails(await getPendingAction(userId, safeSessionId).catch(() => null));
  const cleanMessage = pendingGmailDetails
    ? mergePendingGmailDetails(pendingGmailDetails, rawMessage)
    : rawMessage;
  const baseDate = clientContext?.now && !Number.isNaN(new Date(clientContext.now).getTime())
    ? new Date(clientContext.now)
    : new Date();
  const normalizedMode = normalizeResponseMode(responseMode, stepByStepMode);
  const aiSelection = normalizeAiSelection({ aiProvider, aiModel });
  const userProfile = await getUserProfile(userId);
  const effectiveLanguage = looksHinglish(rawMessage) ? "hi" : (language || userProfile?.language || "en");
  const detectedIntentData = detectIntent(cleanMessage);
  const intentData = pendingGmailDetails
    ? {
        ...detectedIntentData,
        intent: pendingGmailDetails.intent || detectedIntentData.intent,
        confidence: Math.max(detectedIntentData.confidence || 0, 0.9),
        suggestedNextActions: getSuggestedNextActions(pendingGmailDetails.intent || detectedIntentData.intent),
      }
    : detectedIntentData;
  const plannedSteps = buildPlannedSteps(intentData.intent, cleanMessage, location);
  const memoryBundle = await getMemoryBundle(userId, safeSessionId, cleanMessage);

  await saveUserMessage(userId, safeSessionId, rawMessage, {
    messageId,
    intent: intentData.intent,
    responseMode: normalizedMode,
    source: voiceMode ? "voice" : "chat",
    location,
    effectiveMessage: pendingGmailDetails ? cleanMessage : undefined,
  }).catch(() => {});

  const finalizeResponse = async (response) => {
    const envelope = {
      ...response,
      ok: true,
      sessionId: response.sessionId || safeSessionId,
      messageId: response.messageId || crypto.randomUUID(),
      memoryUsed: response.memoryUsed ?? memoryBundle.memoryUsed,
      memoryReferences: response.memoryReferences || memoryBundle.memoryReferences,
      error: response.error || null,
    };
    await saveAssistantMessage(userId, safeSessionId, envelope.finalText || "", {
      messageId: envelope.messageId,
      intent: envelope.intent,
      toolUsed: envelope.toolUsed,
      toolResult: envelope.toolResult,
      actionRequired: envelope.actionRequired,
      success: envelope.success,
      successType: envelope.successType,
      createdTask: envelope.createdTask,
    }).catch(() => {});
    if (
      pendingGmailDetails &&
      !envelope.needsClarification &&
      (envelope.actionRequired || /GmailEmail|gmail_/i.test(String(envelope.toolUsed || "")) || envelope.cards?.type === "emailDraft")
    ) {
      await clearPendingActions(userId, safeSessionId, { kind: "gmail_missing_details" }).catch(() => {});
    }
    return envelope;
  };

  const directAction = await maybeHandleDirectAction({
    userId,
    sessionId: safeSessionId,
    message: cleanMessage,
    intentData,
    location,
    responseMode: normalizedMode,
    language: effectiveLanguage,
    userProfile,
    baseDate,
    aiSelection,
  });
  if (directAction) {
    return finalizeResponse({
      ...directAction,
      sessionId: safeSessionId,
      memoryUsed: memoryBundle.memoryUsed,
      memoryReferences: memoryBundle.memoryReferences,
    });
  }

  if (shouldUseDeterministicAction(intentData.intent)) {
    const deterministic = await runDeterministicFallbackAction({
      userId,
      sessionId: safeSessionId,
      message: cleanMessage,
      intentData,
      location,
      responseMode: normalizedMode,
      language: effectiveLanguage,
      userProfile,
      baseDate,
      providerNote: "Use deterministic backend tool routing for this action.",
      aiSelection,
      clientContext,
    });
    return finalizeResponse({
      ...deterministic,
      sessionId: safeSessionId,
      memoryUsed: memoryBundle.memoryUsed,
      memoryReferences: memoryBundle.memoryReferences,
    });
  }

  let model = getModel({ responseMode: normalizedMode, language: effectiveLanguage, stepByStepMode: normalizedMode === "step-by-step", baseDate, aiSelection, voiceMode });
  if (!model) {
    const fallback = await runDeterministicFallbackAction({
      userId,
      sessionId: safeSessionId,
      message: cleanMessage,
      intentData,
      location,
      responseMode: normalizedMode,
      language: effectiveLanguage,
      userProfile,
      baseDate,
      providerNote: "Use the available AI provider and deterministic actions. Do not mention provider names, fallback behavior, or API-key setup unless the user explicitly asks.",
      aiSelection,
      clientContext,
    });
    return finalizeResponse({
      ...fallback,
      sessionId: safeSessionId,
      memoryUsed: memoryBundle.memoryUsed,
      memoryReferences: memoryBundle.memoryReferences,
    });
  }

  const locationContext = location
    ? `User location context: ${JSON.stringify(location)}`
    : "User location context: not provided.";
  const userContext = userProfile
    ? `User profile context: ${JSON.stringify({ name: userProfile.name, email: userProfile.email, role: userProfile.role, plan: userProfile.plan })}`
    : "User profile context: not available.";
  const prompt = [
    userContext,
    locationContext,
    `Current India date/time: ${getCurrentIndiaDateContext(baseDate)}.`,
    `Detected intent: ${intentData.intent} (${intentData.confidence}).`,
    `Planned steps: ${plannedSteps.join(" | ")}.`,
    `Response mode: ${normalizedMode}.`,
    "You have access to conversation memory. Use memory only when it is relevant to the current request. If you use memory, mention it naturally, for example: 'Previous draft ke basis par...'. Do not reveal internal memory IDs. Do not invent memory.",
    memoryBundle.memoryContext || "Conversation memory: no relevant saved memory for this session.",
    `Current frontend page/context: ${JSON.stringify({ currentPage: clientContext?.currentPage || null, pageContext: clientContext?.pageContext || null })}.`,
    `Voice reply: ${voiceMode ? "ON" : "OFF"}. Do not mention this unless relevant.`,
    `User message: ${cleanMessage}`,
  ].join("\n\n");

  const normalizedHistory = normalizeHistory(history);
  let chat = model.startChat({ history: normalizedHistory });
  let firstResult;
  let functionCalls = [];
  const firstResponseTimeoutMs = voiceMode || normalizedMode === "quick" ? 8000 : 15000;
  const toolSummaryTimeoutMs = voiceMode || normalizedMode === "quick" ? 9000 : 15000;

  try {
    firstResult = await withTimeout(chat.sendMessage(prompt), firstResponseTimeoutMs, "Gemini");
    functionCalls = getFunctionCalls(firstResult.response);
  } catch (err) {
    markGeminiUnavailableFromError(err);
    const fallback = await runDeterministicFallbackAction({
      userId,
      sessionId: safeSessionId,
      message: cleanMessage,
      intentData,
      location,
      responseMode: normalizedMode,
      language: effectiveLanguage,
      userProfile,
      baseDate,
      providerNote: getFriendlyProviderError(err),
      aiSelection,
      clientContext,
    });
    return finalizeResponse(fallback);
  }

  if (functionCalls.length === 0) {
    const forcedTools = getForcedToolNames(cleanMessage);
    if (forcedTools?.length) {
      model = getModel({ responseMode: normalizedMode, language: effectiveLanguage, stepByStepMode: normalizedMode === "step-by-step", allowedFunctionNames: forcedTools, baseDate, aiSelection, voiceMode });
      chat = model.startChat({ history: normalizedHistory });
      try {
        firstResult = await withTimeout(chat.sendMessage(prompt), firstResponseTimeoutMs, "Gemini forced tool call");
        functionCalls = getFunctionCalls(firstResult.response);
      } catch (err) {
        markGeminiUnavailableFromError(err);
        const fallback = await runDeterministicFallbackAction({
          userId,
          sessionId: safeSessionId,
          message: cleanMessage,
          intentData,
          location,
          responseMode: normalizedMode,
          language: effectiveLanguage,
          userProfile,
          baseDate,
          providerNote: getFriendlyProviderError(err),
          aiSelection,
          clientContext,
        });
        return finalizeResponse(fallback);
      }
    }
  }

  let finalText = "";
  let toolUsed = null;
  let toolResult = null;
  let cards = null;
  let uiAction = null;
  let formFill = null;
  let taskCreated = false;
  let success = false;
  let successType = null;
  let successMessage = null;
  let createdTask = null;
  let relatedRecord = null;
  let actionRequired = false;
  let confirmationPayload = null;
  let responsePlannedSteps = plannedSteps;

  if (functionCalls.length > 0) {
    const functionResponses = [];

    for (const functionCall of functionCalls.slice(0, 3)) {
      const name = functionCall.name;
      const args = functionCall.args || {};
      toolUsed = toolUsed || name;

      let execution;
      try {
        execution = await executeTool({ name, args, userId });
      } catch (err) {
        const friendlyError = getFriendlyToolError(err, name);
        return finalizeResponse(buildResponseEnvelope({
          finalText: friendlyError,
          intentData,
          toolUsed: name,
          toolResult: { error: friendlyError },
          plannedSteps: responsePlannedSteps,
          sessionId: safeSessionId,
        }));
      }

      toolResult = execution.result;
      cards = mergeCards(cards, execution.cards);
      uiAction = uiAction || execution.uiAction || execution.result?.uiAction || null;
      formFill = formFill || execution.formFill || execution.result?.formFill || null;
      taskCreated = taskCreated || Boolean(execution.result?.taskCreated);
      if (execution.result?.taskCreated || execution.result?.task) {
        success = true;
        successType = "task_created";
        createdTask = execution.result.task || execution.result.createdTask || null;
        successMessage = createdTask?.title ? `Task added: ${createdTask.title}` : "Task added successfully.";
      }
      if (execution.actionRequired) {
        actionRequired = true;
        confirmationPayload = confirmationPayload || execution.confirmationPayload;
      }
      if (Array.isArray(execution.result?.plan) && execution.result.plan.length) {
        responsePlannedSteps = execution.result.plan;
      }

      functionResponses.push({
        functionResponse: {
          name,
          response: execution.result,
        },
      });
    }

    try {
      const secondResult = await withTimeout(chat.sendMessage(functionResponses), toolSummaryTimeoutMs, "Gemini tool summary");
      finalText = secondResult.response.text();
    } catch (err) {
      finalText = await runTextFallback({
        userId,
        message: cleanMessage,
        responseMode: normalizedMode,
        language: effectiveLanguage,
        providerNote: getFriendlyProviderError(err),
        userProfile,
        aiSelection,
      });
    }
  } else {
    finalText = firstResult.response.text();
  }

  if (!String(finalText || "").trim()) {
    if (actionRequired) {
      finalText = effectiveLanguage === "hi"
        ? "Action ready hai. Main ise tabhi complete karunga jab aap confirmation doge."
        : "The action is ready. I will complete it only after your confirmation.";
    } else if (toolUsed) {
      finalText = effectiveLanguage === "hi"
        ? "Tool result ready hai. Details cards me dekh sakte hain."
        : "The tool result is ready. You can review the details in the cards.";
    } else {
      finalText = await runTextFallback({
        userId,
        message: cleanMessage,
        responseMode: normalizedMode,
        language: effectiveLanguage,
        providerNote: "Gemini returned an empty response.",
        userProfile,
        aiSelection,
      });
    }
  }

  if (
    intentData.intent === "multi_step_task" &&
    !actionRequired &&
    /(calendar|reminder|meeting|event)/i.test(cleanMessage)
  ) {
    const start = parseRelativeDateTime(cleanMessage, /gym/i.test(cleanMessage) ? 7 : 17, baseDate) || addMinutes(new Date(baseDate), 60);
    const calendarExecution = await executeTool({
      name: "createCalendarEvent",
      args: {
        title: /gym/i.test(cleanMessage) ? "Gym reminder" : /meeting/i.test(cleanMessage) ? "Meeting" : "Calendar event",
        startTime: start.toISOString(),
        endTime: addMinutes(start, /gym/i.test(cleanMessage) ? 30 : 60).toISOString(),
        description: "Prepared from Aura AI multi-step chat.",
        attendees: [],
      },
      userId,
    });
    actionRequired = true;
    confirmationPayload = calendarExecution.confirmationPayload;
    toolUsed = toolUsed ? `${toolUsed} + createCalendarEvent` : "createCalendarEvent";
    toolResult = { previous: toolResult, calendar: calendarExecution.result };
    if (!/confirm/i.test(finalText)) {
      finalText += effectiveLanguage === "hi"
        ? "\n\nCalendar reminder bhi ready hai. Add karne ke liye confirmation chahiye."
        : "\n\nThe calendar action is also ready. Confirm before I add it.";
    }
  }

  finalText = polishFinalText(finalText, effectiveLanguage, normalizedMode, { actionRequired, toolUsed, aiSelection });

  await ChatLog.create({
    userId,
    userMessage: cleanMessage,
    aiResponse: finalText,
    language: effectiveLanguage,
    timestamp: new Date(),
  }).catch(() => {});

  return finalizeResponse(buildResponseEnvelope({
    finalText,
    intentData: {
      ...intentData,
      needsClarification: false,
      clarificationQuestion: null,
    },
    toolUsed,
    toolResult,
    actionRequired,
    confirmationPayload,
    uiAction,
    formFill,
    taskCreated,
    success,
    successType,
    successMessage,
    createdTask,
    relatedRecord,
    cards,
    plannedSteps: responsePlannedSteps,
    sessionId: safeSessionId,
    memoryUsed: memoryBundle.memoryUsed,
    memoryReferences: memoryBundle.memoryReferences,
  }));
}

module.exports = { runAgentChat };
