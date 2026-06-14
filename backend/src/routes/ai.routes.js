// ============================================================
// AI Agent Routes — /api/ai/*
// ============================================================
const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const { runAgentChat } = require("../services/agent.service");
const {
  attachPendingAction,
  confirmPendingAction,
} = require("../services/actionConfirmation.service");
const {
  getVoiceSession,
  normalizeLanguage,
  saveVoiceTranscript,
  upsertVoiceSession,
} = require("../services/voice.service");

router.use(authMiddleware);

function buildAgentFailureResponse({
  error,
  finalText,
  spokenText = "",
  sessionId = "default",
  intent = "unknown_needs_clarification",
  confidence = 0.35,
  clarificationQuestion = "Can you please share one more detail so I can help?",
  suggestedNextActions = ["Try a more specific request", "Check connected services"],
  activityTimeline = ["Received request", "Processing failed", "Returned safe fallback"],
  ...extra
}) {
  return {
    ok: false,
    sessionId,
    messageId: crypto.randomUUID(),
    error,
    finalText,
    spokenText,
    intent,
    confidence,
    needsClarification: true,
    clarificationQuestion,
    memoryUsed: false,
    memoryReferences: [],
    toolUsed: null,
    toolResult: null,
    actionRequired: false,
    confirmationPayload: null,
    uiAction: null,
    formFill: null,
    taskCreated: false,
    success: false,
    successType: null,
    successMessage: null,
    createdTask: null,
    relatedRecord: null,
    cards: null,
    suggestedNextActions,
    plannedSteps: [],
    activityTimeline,
    ...extra,
  };
}

router.post("/chat", async (req, res) => {
  const { message, history, voiceMode, responseMode, stepByStepMode, location, language, clientContext, sessionId, aiProvider, aiModel } = req.body;
  const selectedResponseMode = responseMode || (stepByStepMode ? "step-by-step" : "normal");

  try {
    const result = await runAgentChat({
      userId: req.user.id,
      message,
      history,
      voiceMode: Boolean(voiceMode),
      responseMode: selectedResponseMode,
      stepByStepMode: Boolean(stepByStepMode) || selectedResponseMode === "step-by-step",
      location,
      language,
      clientContext,
      sessionId: sessionId || clientContext?.sessionId,
      aiProvider,
      aiModel,
    });

    let response = result;
    if (result.actionRequired && result.confirmationPayload && !result.confirmationPayload.actionId) {
      const confirmationPayload = await attachPendingAction({
        userId: req.user.id,
        sessionId: result.sessionId || sessionId || clientContext?.sessionId || "default",
        confirmationPayload: result.confirmationPayload,
      });
      response = { ...result, confirmationPayload };
    }

    res.json(response);
  } catch (err) {
    console.error("AI agent chat error:", err.message);
    res.status(200).json(buildAgentFailureResponse({
      error: "Aura AI agent failed.",
      finalText: "Aura AI ko request process karne me issue aa gaya. Thoda specific prompt ke saath dobara try karo. Raw server error hide kar diya gaya hai.",
      confidence: 0.45,
      clarificationQuestion: "Can you please share one more detail so I can help?",
      suggestedNextActions: ["Try a more specific request", "Ask for help with email or calendar actions"],
      activityTimeline: ["Understanding request", "AI provider failed", "Returned safe fallback"],
      sessionId: sessionId || clientContext?.sessionId || "default",
    }));
  }
});

router.post("/confirm-action", async (req, res) => {
  try {
    const { sessionId, actionId, decision, editedData } = req.body;
    if (!sessionId || !actionId) return res.status(400).json({ error: "sessionId and actionId are required." });
    const result = await confirmPendingAction({
      userId: req.user.id,
      sessionId,
      actionId,
      decision,
      editedData,
    });
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({
      error: err.message || "Failed to confirm action.",
      code: err.code || "ACTION_CONFIRM_FAILED",
    });
  }
});

function isConfirmCommand(text) {
  return /\b(yes|confirm|confirmed|haan|ha|okay|ok|kar do|approve)\b/i.test(text || "");
}

function isCancelCommand(text) {
  return /\b(cancel|stop|nahi|no|mat karo|reject)\b/i.test(text || "");
}

function isStopSpeakingCommand(text) {
  return /\b(stop speaking|stop voice|speech stop|bolna band|voice band)\b/i.test(text || "");
}

function getAgentLanguage(language, transcript) {
  const normalized = normalizeLanguage(language);
  if (normalized.startsWith("hi") || /[\u0900-\u097F]|(haan|nahi|karo|batao|mere|aas paas|kal)/i.test(transcript || "")) {
    return "hi";
  }
  return "en";
}

function buildSpokenText(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, "code example shown on screen")
    .replace(/\s+/g, " ")
    .slice(0, 420)
    .trim();
}

function normalizeVoiceResponseMode(responseMode) {
  const selected = String(responseMode || "").trim().toLowerCase();
  if (selected === "deep-explain" || selected === "step-by-step") return selected;
  return "quick";
}

router.post("/voice-command", async (req, res) => {
  const {
    transcript,
    detectedLanguage,
    voiceMode,
    sessionId,
    location,
    responseMode,
    voiceReply,
    history,
    currentPage,
    pageContext,
    clientContext,
    aiProvider,
    aiModel,
  } = req.body;
  const cleanTranscript = String(transcript || "").trim();
  const safeSessionId = sessionId || crypto.randomUUID();

  if (!cleanTranscript) {
    return res.status(400).json(buildAgentFailureResponse({
      error: "Transcript is required.",
      confidence: 0,
      finalText: "I could not understand the voice clearly. Please try again or type the command.",
      spokenText: "Please try again.",
      sessionId: safeSessionId,
      transcript: "",
      detectedLanguage: normalizeLanguage(detectedLanguage),
    }));
  }

  try {
    await upsertVoiceSession(req.user.id, safeSessionId, {
      state: "thinking",
      lastTranscript: cleanTranscript,
      selectedLanguage: detectedLanguage || "auto",
    });

    if (isStopSpeakingCommand(cleanTranscript)) {
      return res.json({
        ok: true,
        intent: "voice_control",
        confidence: 0.98,
        transcript: cleanTranscript,
        detectedLanguage: normalizeLanguage(detectedLanguage),
        finalText: "Voice playback stopped.",
        spokenText: "",
        needsClarification: false,
        clarificationQuestion: null,
        plannedSteps: ["Stop current voice playback"],
        toolUsed: null,
        toolResult: null,
        actionRequired: false,
        confirmationPayload: null,
        suggestedNextActions: ["Continue typing", "Start another voice command"],
        ttsAudio: null,
        activityTimeline: ["Detected voice control command", "Stopped speaking"],
        memoryUsed: false,
        memoryReferences: [],
        success: false,
        successType: null,
        successMessage: null,
        createdTask: null,
        relatedRecord: null,
        sessionId: safeSessionId,
      });
    }

    const session = await getVoiceSession(req.user.id, safeSessionId);
    if (session?.pendingActionId && (isConfirmCommand(cleanTranscript) || isCancelCommand(cleanTranscript))) {
      const result = await confirmPendingAction({
        userId: req.user.id,
        sessionId: safeSessionId,
        actionId: session.pendingActionId,
        decision: isConfirmCommand(cleanTranscript) ? "confirm" : "cancel",
        editedData: {},
      });

      return res.json({
        ok: true,
        intent: "voice_control",
        confidence: 0.96,
        transcript: cleanTranscript,
        detectedLanguage: normalizeLanguage(detectedLanguage),
        finalText: result.finalText,
        spokenText: result.spokenText,
        needsClarification: false,
        clarificationQuestion: null,
        plannedSteps: ["Read pending action", isConfirmCommand(cleanTranscript) ? "Confirm action" : "Cancel action"],
        toolUsed: result.type || null,
        toolResult: result.result || result,
        actionRequired: false,
        confirmationPayload: null,
        suggestedNextActions: ["Ask another command"],
        ttsAudio: null,
        activityTimeline: ["Detected confirmation voice command", result.cancelled ? "Cancelled pending action" : "Completed pending action"],
        memoryUsed: false,
        memoryReferences: [],
        success: Boolean(result.success && !result.cancelled),
        successType: result.successType || result.type || null,
        successMessage: result.successMessage || result.finalText,
        createdTask: result.createdTask || result.task || null,
        relatedRecord: result.relatedRecord || result.result || null,
        sessionId: safeSessionId,
      });
    }

    const selectedResponseMode = normalizeVoiceResponseMode(responseMode);
    const result = await runAgentChat({
      userId: req.user.id,
      message: cleanTranscript,
      history,
      voiceMode: Boolean(voiceMode),
      responseMode: selectedResponseMode,
      stepByStepMode: selectedResponseMode === "step-by-step",
      location,
      language: getAgentLanguage(detectedLanguage, cleanTranscript),
      clientContext: {
        ...(clientContext || {}),
        sessionId: safeSessionId,
        currentPage,
        pageContext,
      },
      sessionId: safeSessionId,
      aiProvider,
      aiModel,
    });

    let confirmationPayload = result.confirmationPayload;
    if (result.actionRequired && result.confirmationPayload) {
      confirmationPayload = await attachPendingAction({
        userId: req.user.id,
        sessionId: safeSessionId,
        confirmationPayload: result.confirmationPayload,
      });
    } else {
      await upsertVoiceSession(req.user.id, safeSessionId, {
        state: "completed",
        pendingActionId: "",
        pendingActionPayload: null,
        lastIntent: result.intent,
        lastToolResult: result.toolResult,
      });
    }

    const spokenText = buildSpokenText(result.finalText);

    await saveVoiceTranscript({
      userId: req.user.id,
      sessionId: safeSessionId,
      finalText: cleanTranscript,
      detectedLanguage,
      confidence: result.confidence,
      intent: result.intent,
      toolsUsed: result.toolUsed ? [result.toolUsed] : [],
    }).catch(() => {});

    res.json({
      ...result,
      transcript: cleanTranscript,
      detectedLanguage: normalizeLanguage(detectedLanguage),
      spokenText,
      confirmationPayload,
      ttsAudio: null,
      ttsDeferred: Boolean(voiceReply && spokenText),
    });
  } catch (err) {
    console.error("AI voice command error:", err.message);
    res.status(200).json(buildAgentFailureResponse({
      error: "Aura voice command failed.",
      confidence: 0.35,
      finalText: "Voice command process karne me issue aa gaya. Please command ko thoda clear bolkar ya type karke try karo.",
      spokenText: "Please try again.",
      clarificationQuestion: "Can you repeat the command more clearly?",
      activityTimeline: ["Received voice command", "Processing failed", "Returned safe fallback"],
      sessionId: safeSessionId,
      transcript: cleanTranscript,
      detectedLanguage: normalizeLanguage(detectedLanguage),
      ttsAudio: null,
    }));
  }
});

module.exports = router;
