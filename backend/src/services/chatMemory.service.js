const ChatSessionMemory = require("../../models/mongo/ChatSessionMemory");
const { preserveMultilineBody, safeTrimSingleLine } = require("../utils/textFormat");

const MAX_MESSAGES = 60;
const MAX_REFERENCES = 40;

function normalizeSessionId(sessionId) {
  return safeTrimSingleLine(sessionId || "default").slice(0, 120) || "default";
}

function stripSecrets(value, depth = 0) {
  if (depth > 5) return null;
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => stripSecrets(item, depth + 1));
  if (!value || typeof value !== "object") return value;

  return Object.entries(value).reduce((acc, [key, item]) => {
    if (/token|secret|password|authorization|api[_-]?key|credential/i.test(key)) return acc;
    acc[key] = stripSecrets(item, depth + 1);
    return acc;
  }, {});
}

async function getOrCreateSession(userId, sessionId) {
  const safeSessionId = normalizeSessionId(sessionId);
  let memory = await ChatSessionMemory.findOne({ userId: String(userId), sessionId: safeSessionId });
  if (!memory) {
    memory = await ChatSessionMemory.create({ userId: String(userId), sessionId: safeSessionId, messages: [], references: [] });
  }
  return memory;
}

async function summarizeOldMemory(userId, sessionId) {
  const memory = await getOrCreateSession(userId, sessionId);
  if (memory.messages.length <= MAX_MESSAGES) return memory.summary || "";

  const removed = memory.messages.splice(0, memory.messages.length - MAX_MESSAGES);
  const compact = removed
    .slice(-12)
    .map((msg) => `${msg.role}: ${String(msg.content).slice(0, 220)}`)
    .join(" | ");
  memory.summary = [memory.summary, compact].filter(Boolean).join(" | ").slice(-4000);
  await memory.save();
  return memory.summary;
}

async function saveMessage(userId, sessionId, role, content, metadata = {}) {
  if (!String(content || "").trim()) return null;
  const memory = await getOrCreateSession(userId, sessionId);
  memory.messages.push({
    role,
    content: preserveMultilineBody(content).slice(0, 12000),
    metadata: stripSecrets(metadata) || {},
  });
  if (memory.messages.length > MAX_MESSAGES + 10) {
    memory.messages.splice(0, memory.messages.length - MAX_MESSAGES);
  }
  await memory.save();
  return memory.messages[memory.messages.length - 1];
}

async function saveUserMessage(userId, sessionId, content, metadata = {}) {
  return saveMessage(userId, sessionId, "user", content, metadata);
}

async function saveAssistantMessage(userId, sessionId, content, metadata = {}) {
  const saved = await saveMessage(userId, sessionId, "assistant", content, metadata);
  if (metadata?.toolUsed && metadata?.toolResult) {
    await saveToolResult(userId, sessionId, metadata.toolUsed, metadata.toolResult);
  }
  return saved;
}

async function getRecentMemory(userId, sessionId, limit = 10) {
  const memory = await getOrCreateSession(userId, sessionId);
  return memory.messages.slice(-limit).map((msg) => ({
    role: msg.role,
    content: msg.content,
    createdAt: msg.createdAt,
    metadata: msg.metadata || {},
  }));
}

function scoreReference(reference, query) {
  const text = `${reference.type} ${reference.summary} ${JSON.stringify(reference.data || {})}`.toLowerCase();
  const words = String(query || "").toLowerCase().split(/[^a-z0-9\u0900-\u097F]+/).filter((word) => word.length > 2);
  return words.reduce((score, word) => score + (text.includes(word) ? 1 : 0), 0);
}

async function getRelevantMemory(userId, sessionId, query) {
  const memory = await getOrCreateSession(userId, sessionId);
  const references = [...(memory.references || [])]
    .map((ref) => ({ ref, score: scoreReference(ref, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((item) => ({
      type: item.ref.type,
      summary: item.ref.summary,
      messageId: item.ref.messageId || "",
      createdAt: item.ref.createdAt,
      data: item.ref.data || {},
    }));

  const queryText = String(query || "").toLowerCase();
  if (/last draft|same draft|previous draft|pichla draft|pehle wala draft/.test(queryText)) {
    const draft = await getLastDraft(userId, sessionId);
    if (draft && !references.some((ref) => ref.type === "previous_draft")) references.unshift(draft);
  }
  if (/first|second|third|last|pehla|dusra|teesra|wala|location|place|gym|cafe|shop/.test(queryText)) {
    const location = await getLastLocationResults(userId, sessionId);
    if (location && !references.some((ref) => ref.type === "previous_location")) references.unshift(location);
  }

  return references.slice(0, 8);
}

async function addReference(userId, sessionId, reference) {
  if (!reference?.type || !reference?.summary) return null;
  const memory = await getOrCreateSession(userId, sessionId);
  memory.references.push({
    type: reference.type,
    summary: safeTrimSingleLine(reference.summary).slice(0, 500),
    data: stripSecrets(reference.data || {}),
    messageId: reference.messageId || "",
  });
  if (memory.references.length > MAX_REFERENCES) {
    memory.references.splice(0, memory.references.length - MAX_REFERENCES);
  }
  await memory.save();
  return memory.references[memory.references.length - 1];
}

async function savePendingAction(userId, sessionId, action = {}) {
  await clearPendingActions(userId, sessionId, { kind: action.kind });
  return addReference(userId, sessionId, {
    type: "pending_action",
    summary: action.summary || "Pending action needs more details",
    data: {
      ...action,
      status: "pending",
      createdAt: new Date().toISOString(),
    },
  });
}

async function clearPendingActions(userId, sessionId, filter = {}) {
  const memory = await getOrCreateSession(userId, sessionId);
  const originalLength = memory.references.length;
  memory.references = memory.references.filter((ref) => {
    if (ref.type !== "pending_action") return true;
    if (filter.kind && ref.data?.kind !== filter.kind) return true;
    return false;
  });
  if (memory.references.length === originalLength) return 0;
  await memory.save();
  return originalLength - memory.references.length;
}

async function saveToolResult(userId, sessionId, toolName, result) {
  const safeResult = stripSecrets(result || {});
  const name = safeTrimSingleLine(toolName || "tool");

  if (name === "draftGmailEmail" || name === "sendGmailEmail" || name === "scheduleGmailEmail" || safeResult?.preview?.body || safeResult?.data?.body) {
    const draft = safeResult.preview || safeResult.data || safeResult;
    return addReference(userId, sessionId, {
      type: "previous_draft",
      summary: `Gmail draft: ${draft.subject || "No subject"} to ${draft.to || "unknown recipient"}`,
      data: {
        to: draft.to || "",
        subject: draft.subject || "",
        body: preserveMultilineBody(draft.body || ""),
        tone: draft.tone || "",
      },
    });
  }

  const places = safeResult?.places || (Array.isArray(safeResult) ? safeResult : null);
  if (name === "searchNearbyPlaces" || places?.length) {
    const topPlaces = (places || []).slice(0, 5);
    return addReference(userId, sessionId, {
      type: "previous_location",
      summary: `Location search returned ${topPlaces.length} places: ${topPlaces.map((place) => place.name).filter(Boolean).join(", ")}`,
      data: { places: topPlaces },
    });
  }

  if (safeResult?.task || safeResult?.taskCreated) {
    const task = safeResult.task || safeResult.createdTask || {};
    return addReference(userId, sessionId, {
      type: "previous_task",
      summary: `Task created: ${task.title || "Aura AI task"}`,
      data: task,
    });
  }

  return addReference(userId, sessionId, {
    type: "tool_result",
    summary: `${name} result saved`,
    data: safeResult,
  });
}

async function getLastReference(userId, sessionId, type) {
  const memory = await getOrCreateSession(userId, sessionId);
  const ref = [...(memory.references || [])].reverse().find((item) => item.type === type);
  if (!ref) return null;
  return {
    type: ref.type,
    summary: ref.summary,
    messageId: ref.messageId || "",
    createdAt: ref.createdAt,
    data: ref.data || {},
  };
}

async function getLastToolResult(userId, sessionId, toolName) {
  const memory = await getOrCreateSession(userId, sessionId);
  return [...(memory.references || [])].reverse().find((ref) => {
    const data = JSON.stringify(ref.data || {}).toLowerCase();
    return data.includes(String(toolName || "").toLowerCase()) || ref.summary.toLowerCase().includes(String(toolName || "").toLowerCase());
  }) || null;
}

async function getLastDraft(userId, sessionId) {
  return getLastReference(userId, sessionId, "previous_draft");
}

async function getLastLocationResults(userId, sessionId) {
  return getLastReference(userId, sessionId, "previous_location");
}

async function getPendingAction(userId, sessionId) {
  return getLastReference(userId, sessionId, "pending_action");
}

module.exports = {
  saveUserMessage,
  saveAssistantMessage,
  getRecentMemory,
  getRelevantMemory,
  summarizeOldMemory,
  saveToolResult,
  getLastToolResult,
  getLastDraft,
  getLastLocationResults,
  getPendingAction,
  savePendingAction,
  clearPendingActions,
  normalizeSessionId,
};
