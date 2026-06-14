// ============================================================
// AI Message Controller - context-aware 5-line writer
// ============================================================
const { chat } = require("../services/openai.service");

const CONTEXTS = new Set(["task", "chat", "call", "message"]);

const CONTEXT_CONFIG = {
  task: {
    typeLabel: "Type",
    defaultType: "Reminder",
    fallbackLines: [
      "Complete the requested task with clear ownership and focused execution today.",
      "This matters because delayed action creates confusion and weak follow-through later.",
      "Start by collecting the needed details, contacts, files, and current status.",
      "Set a realistic deadline today or choose the next available working slot.",
      "Finish with a clear result, shared update, and no pending confusion.",
    ],
    template: ({ topic, selectedType, previousList }) => `Write a structured 5-line task description for: ${topic}
Type: ${selectedType}
Format:
Line 1: What needs to be done as a clear action
Line 2: Why this matters or the useful context
Line 3: First concrete step to start the task
Line 4: Suggested deadline or time to complete it
Line 5: Expected result when the task is done
Keep each line short, professional, and useful.
Do NOT repeat or closely resemble these previous versions:
${previousList}
IMPORTANT: Return exactly 5 lines.
Each line 10-20 words.
No numbering. No bullet points. No labels.
Only the 5 lines of content.`,
  },
  chat: {
    typeLabel: "Intent",
    defaultType: "Ask a question",
    fallbackLines: [
      "I need clear help with this request and want a practical answer.",
      "The context is important because I need the response to fit my situation.",
      "Please include specific steps, assumptions, and any important risks or limits.",
      "Format the answer in concise sections with direct action points I can use.",
      "Treat this as current priority unless you need more information from me.",
    ],
    template: ({ topic, selectedType, previousList }) => `Write a clear 5-line message to send to an AI assistant about: ${topic}
Intent: ${selectedType}
Format:
Line 1: Main request that is direct and clear
Line 2: Context or background information
Line 3: Specific requirements or preferences
Line 4: Preferred response format
Line 5: Timeline or urgency
Keep each line concise, conversational, and clear.
Do NOT repeat or closely resemble these previous versions:
${previousList}
IMPORTANT: Return exactly 5 lines.
Each line 10-20 words.
No numbering. No bullet points. No labels.
Only the 5 lines of content.`,
  },
  call: {
    typeLabel: "Call type",
    defaultType: "Reminder",
    fallbackLines: [
      "Hello, this is Aura calling on behalf of the requester today.",
      "The purpose of this call is to share an important update clearly.",
      "Please listen to the main details and note what needs attention.",
      "Take the requested action soon, or reply with your available time.",
      "Thank you, and please follow the next step when convenient.",
    ],
    template: ({ topic, selectedType, previousList }) => `Write a natural 5-line phone call script for: ${topic}
Call type: ${selectedType}
Format:
Line 1: Greeting and introduction, including who is calling
Line 2: Clear purpose of this call
Line 3: Key information or main point
Line 4: Specific action requested from the listener
Line 5: Polite closing and next step
Use natural spoken language and avoid jargon.
Do NOT repeat or closely resemble these previous versions:
${previousList}
IMPORTANT: Return exactly 5 lines.
Each line 10-20 words.
No numbering. No bullet points. No labels.
Only the 5 lines of content.`,
  },
  message: {
    typeLabel: "Tone",
    defaultType: "Formal",
    fallbackLines: [
      "Hello, I wanted to share an important update with you today.",
      "This message is about the topic we need to handle without delay.",
      "Please review the details carefully and let me know your response.",
      "Try to reply when possible so the next step can be planned.",
      "Thank you, and I will wait for your confirmation or update.",
    ],
    template: ({ topic, selectedType, channel, previousList }) => `Write a ${channel === "whatsapp" ? "WhatsApp" : "SMS"} message about: ${topic}
Tone: ${selectedType}
Format:
Line 1: Friendly opening and reason for the message
Line 2: Useful context or why this message matters
Line 3: Main information the recipient needs to know
Line 4: Action or reply requested from the recipient
Line 5: Polite closing with next step
Do NOT repeat or closely resemble these previous versions:
${previousList}
IMPORTANT: Return exactly 5 lines.
Each line 10-20 words.
No numbering. No bullet points. No labels.
Only the 5 lines of content.`,
  },
};

function normalizeContext(value) {
  const context = String(value || "message").trim().toLowerCase();
  return CONTEXTS.has(context) ? context : "message";
}

function normalizeChannel(value) {
  return value === "whatsapp" ? "whatsapp" : "sms";
}

function normalizeSelectedType(value, context) {
  return String(value || CONTEXT_CONFIG[context].defaultType).trim() || CONTEXT_CONFIG[context].defaultType;
}

function normalizePreviousMessages(value) {
  return Array.isArray(value)
    ? value.map((message) => String(message || "").trim()).filter(Boolean).slice(-8)
    : [];
}

function normalizeForCompare(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isTooSimilar(candidate, previousMessages) {
  const normalizedCandidate = normalizeForCompare(candidate);
  if (!normalizedCandidate) return true;

  return previousMessages.some((previous) => {
    const normalizedPrevious = normalizeForCompare(previous);
    if (!normalizedPrevious) return false;
    if (normalizedPrevious === normalizedCandidate) return true;

    const candidateWords = new Set(normalizedCandidate.split(" ").filter((word) => word.length > 2));
    const previousWords = new Set(normalizedPrevious.split(" ").filter((word) => word.length > 2));
    if (!candidateWords.size || !previousWords.size) return false;

    let overlap = 0;
    candidateWords.forEach((word) => {
      if (previousWords.has(word)) overlap += 1;
    });

    return overlap / Math.min(candidateWords.size, previousWords.size) >= 0.82;
  });
}

function stripLinePrefix(line) {
  return String(line || "")
    .replace(/^\s*[-*\u2022]\s*/, "")
    .replace(/^\s*\d+[.)]\s*/, "")
    .replace(/^\s*line\s*\d+\s*:\s*/i, "")
    .replace(/^\s*(objective|context|step|deadline|outcome|request|details|format|timeline|opening|purpose|action|closing)\s*:\s*/i, "")
    .replace(/^["'\u201c\u201d]+|["'\u201c\u201d]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitGeneratedLines(value) {
  const text = String(value || "")
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .replace(/\r/g, "")
    .trim();

  let lines = text
    .split("\n")
    .map(stripLinePrefix)
    .filter(Boolean);

  if (lines.length < 5) {
    lines = text
      .split(/(?<=[.!?])\s+/)
      .map(stripLinePrefix)
      .filter(Boolean);
  }

  return lines;
}

function lineWordCount(line) {
  return String(line || "").split(/\s+/).filter(Boolean).length;
}

function padShortLine(line, index, context) {
  const suffixes = {
    task: [
      "so ownership and next steps stay clear.",
      "because it supports timely progress and better follow-through.",
      "by checking the most important details before moving ahead.",
      "with enough time for review, response, and adjustment.",
      "so the final result is useful, visible, and complete.",
    ],
    chat: [
      "so the assistant understands the exact request.",
      "because that background changes the quality of the answer.",
      "including limits, preferences, examples, and any important constraints.",
      "using short sections, direct bullets, and clear next steps.",
      "as soon as practical, unless more details are needed first.",
    ],
    call: [
      "and I am calling to keep this simple and clear.",
      "because this update needs attention and a direct response.",
      "including the main detail that should be remembered after this call.",
      "when you are available, please confirm or take the next step.",
      "thank you for your time, and please respond when convenient.",
    ],
    message: [
      "so the message is clear and easy to respond to.",
      "because a quick response will help avoid delay or confusion.",
      "including the key detail that needs your attention today.",
      "when possible, please reply with your confirmation or update.",
      "thank you, and I will wait for your response.",
    ],
  };

  const clean = String(line || "").replace(/[,\s]+$/g, "").trim();
  const suffix = suffixes[context]?.[index] || "with clear next steps and useful context.";
  return `${clean} ${suffix}`.replace(/\s+/g, " ").trim();
}

function trimLongLine(line) {
  const words = String(line || "").split(/\s+/).filter(Boolean);
  if (words.length <= 20) return line.trim();
  return words.slice(0, 20).join(" ").replace(/[,\s]+$/g, "").trim();
}

function normalizeFiveLineOutput(value, context) {
  const fallback = CONTEXT_CONFIG[context].fallbackLines;
  let lines = splitGeneratedLines(value).slice(0, 5);

  while (lines.length < 5) {
    lines.push(fallback[lines.length]);
  }

  lines = lines.map((line, index) => {
    let nextLine = stripLinePrefix(line) || fallback[index];
    if (lineWordCount(nextLine) < 10) nextLine = padShortLine(nextLine, index, context);
    return trimLongLine(nextLine);
  });

  return lines.slice(0, 5).join("\n");
}

function buildPrompt({ context, topic, selectedType, channel, previousMessages, attempt }) {
  const previousList = previousMessages.length
    ? previousMessages.map((message, index) => `${index + 1}. ${message}`).join("\n---\n")
    : "None";

  return `${CONTEXT_CONFIG[context].template({ topic, selectedType, channel, previousList })}

Attempt number: ${attempt}. Make this version meaningfully different from all previous versions.`;
}

function buildFallbackMessage({ context, topic, selectedType }) {
  const intro = String(topic || "the requested item").trim();
  const type = String(selectedType || CONTEXT_CONFIG[context].defaultType).trim();

  const fallbacks = {
    task: [
      `Complete ${intro} with clear ownership and a practical action plan.`,
      `This matters because ${type.toLowerCase()} tasks need timely follow-through and visible progress.`,
      "Start by checking the current status, required details, and responsible person.",
      "Aim to complete it today or schedule a realistic focused work slot.",
      "The expected result is a finished task with no unclear next step.",
    ],
    chat: [
      `I need help with ${intro} and want a clear practical response.`,
      `The context is ${type.toLowerCase()}, so please consider the real constraints involved.`,
      "Include specific requirements, useful assumptions, possible risks, and recommended next steps.",
      "Format the answer in concise sections that are easy to scan and apply.",
      "Treat this as a current priority unless you need more details from me.",
    ],
    call: [
      `Hello, this is Aura calling about ${intro} on behalf of the requester.`,
      `The purpose of this ${type.toLowerCase()} call is to share the key point clearly.`,
      "Please note the important detail and consider the action being requested now.",
      "When possible, confirm your response or complete the requested next step.",
      "Thank you for your time, and please follow up when convenient.",
    ],
    message: [
      `Hello, I wanted to share a quick update about ${intro} today.`,
      `This matters because a timely response will help avoid delay or confusion.`,
      "Please review the key detail and let me know if anything needs correction.",
      "When possible, reply with your confirmation, update, or preferred next step.",
      "Thank you, and I will wait for your response before moving ahead.",
    ],
  };

  return normalizeFiveLineOutput(fallbacks[context].join("\n"), context);
}

async function generateMessage(req, res) {
  const context = normalizeContext(req.body.context);
  const topic = String(req.body.topic || "").trim();
  const selectedType = normalizeSelectedType(req.body.selectedType || req.body.tone || req.body.type, context);
  const channel = normalizeChannel(req.body.activeTab || req.body.channel);
  const previousMessages = normalizePreviousMessages(req.body.previousMessages);

  if (!topic) {
    return res.status(400).json({ error: "Topic likhna zaroori hai" });
  }

  try {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const prompt = buildPrompt({ context, topic, selectedType, channel, previousMessages, attempt });
      const generated = await chat(req.user.id, prompt, "en");
      const message = normalizeFiveLineOutput(generated, context);

      if (message && !isTooSimilar(message, previousMessages)) {
        return res.json({ message });
      }

      if (message) previousMessages.push(message);
    }

    return res.json({ message: buildFallbackMessage({ context, topic, selectedType }) });
  } catch (err) {
    console.error("AI message generation error:", err.message);
    return res.status(502).json({ error: "Aura AI could not write this message right now." });
  }
}

module.exports = { generateMessage };
