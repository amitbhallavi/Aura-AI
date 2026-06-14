// ============================================================
// Chat Slice — AI chat messages state
// ============================================================
import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { chatAPI } from "../../services/api";

// ---------------------------------------------------------------
// Async: Send a text message to AI
// ---------------------------------------------------------------
export const sendMessage = createAsyncThunk(
  "chat/sendMessage",
  async ({ message, sessionId, language, history, voiceMode, responseMode, stepByStepMode, location, clientContext, aiProvider, aiModel }, { rejectWithValue }) => {
    try {
      const res = await chatAPI.sendAgentMessage({
        message,
        sessionId,
        language,
        history,
        voiceMode,
        responseMode,
        stepByStepMode,
        location,
        clientContext,
        aiProvider,
        aiModel,
      });
      return { userMessage: message, aiResponse: res.data };
    } catch (err) {
      return rejectWithValue(err.response?.data?.finalText || err.response?.data?.error || "Failed to send message.");
    }
  }
);

export const sendVoiceCommand = createAsyncThunk(
  "chat/sendVoiceCommand",
  async ({
    transcript,
    detectedLanguage,
    voiceMode,
    sessionId,
    location,
    responseMode,
    voiceReply,
    history,
    clientContext,
    currentPage,
    pageContext,
    aiProvider,
    aiModel,
  }, { rejectWithValue }) => {
    try {
      const res = await chatAPI.sendVoiceCommand({
        transcript,
        detectedLanguage,
        voiceMode,
        sessionId,
        location,
        responseMode,
        voiceReply,
        history,
        clientContext,
        currentPage,
        pageContext,
        aiProvider,
        aiModel,
      });
      return { userMessage: transcript, aiResponse: res.data };
    } catch (err) {
      return rejectWithValue(err.response?.data?.finalText || err.response?.data?.error || "Failed to process voice command.");
    }
  }
);

// ---------------------------------------------------------------
// Async: Load chat history from backend
// ---------------------------------------------------------------
export const loadHistory = createAsyncThunk("chat/loadHistory", async () => {
  const res = await chatAPI.getHistory(50);
  return res.data;
});

// ---------------------------------------------------------------
// Async: Clear AI memory
// ---------------------------------------------------------------
export const clearMemory = createAsyncThunk("chat/clearMemory", async () => {
  await chatAPI.clearMemory();
});

// ---------------------------------------------------------------
// Slice
// ---------------------------------------------------------------
const chatSlice = createSlice({
  name: "chat",
  initialState: {
    // Messages shown in chat window (local session)
    messages:  [],
    isTyping:  false,   // True while AI is generating response
    isLoading: false,
    error:     null,
    language:  "en",    // "en" or "hi"
  },
  reducers: {
    setLanguage: (state, action) => { state.language = action.payload; },
    clearMessages: (state) => { state.messages = []; },
    clearError: (state) => { state.error = null; },
    appendAssistantMessage: (state, action) => {
      state.messages.push({
        role: "assistant",
        timestamp: new Date().toISOString(),
        ...action.payload,
      });
    },
  },
  extraReducers: (builder) => {
    builder
      // Send message
      .addCase(sendMessage.pending, (state, action) => {
        state.isTyping = true;
        state.error = null;
        // Optimistic update: show user message immediately (don't wait for server)
        state.messages.push({
          role: "user",
          content: action.meta.arg.message,
          timestamp: new Date().toISOString(),
        });
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.isTyping = false;
        state.messages.push({
          role: "assistant",
          content: action.payload.aiResponse.finalText,
          ok: action.payload.aiResponse.ok,
          error: action.payload.aiResponse.error,
          sessionId: action.payload.aiResponse.sessionId,
          messageId: action.payload.aiResponse.messageId,
          spokenText: action.payload.aiResponse.spokenText,
          ttsAudio: action.payload.aiResponse.ttsAudio,
          intent: action.payload.aiResponse.intent,
          confidence: action.payload.aiResponse.confidence,
          needsClarification: action.payload.aiResponse.needsClarification,
          clarificationQuestion: action.payload.aiResponse.clarificationQuestion,
          memoryUsed: action.payload.aiResponse.memoryUsed,
          memoryReferences: action.payload.aiResponse.memoryReferences,
          suggestedNextActions: action.payload.aiResponse.suggestedNextActions,
          plannedSteps: action.payload.aiResponse.plannedSteps,
          activityTimeline: action.payload.aiResponse.activityTimeline,
          toolUsed: action.payload.aiResponse.toolUsed,
          toolResult: action.payload.aiResponse.toolResult,
          actionRequired: action.payload.aiResponse.actionRequired,
          confirmationPayload: action.payload.aiResponse.confirmationPayload,
          uiAction: action.payload.aiResponse.uiAction,
          formFill: action.payload.aiResponse.formFill,
          taskCreated: action.payload.aiResponse.taskCreated,
          success: action.payload.aiResponse.success,
          successType: action.payload.aiResponse.successType,
          successMessage: action.payload.aiResponse.successMessage,
          createdTask: action.payload.aiResponse.createdTask,
          relatedRecord: action.payload.aiResponse.relatedRecord,
          cards: action.payload.aiResponse.cards,
          timestamp: new Date().toISOString(),
        });
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.isTyping = false;
        state.error = action.payload;
      })
      .addCase(sendVoiceCommand.pending, (state, action) => {
        state.isTyping = true;
        state.error = null;
        state.messages.push({
          role: "user",
          content: action.meta.arg.transcript,
          source: "voice",
          detectedLanguage: action.meta.arg.detectedLanguage,
          timestamp: new Date().toISOString(),
        });
      })
      .addCase(sendVoiceCommand.fulfilled, (state, action) => {
        state.isTyping = false;
        state.messages.push({
          role: "assistant",
          content: action.payload.aiResponse.finalText,
          ok: action.payload.aiResponse.ok,
          error: action.payload.aiResponse.error,
          sessionId: action.payload.aiResponse.sessionId,
          messageId: action.payload.aiResponse.messageId,
          spokenText: action.payload.aiResponse.spokenText,
          ttsAudio: action.payload.aiResponse.ttsAudio,
          transcript: action.payload.aiResponse.transcript,
          detectedLanguage: action.payload.aiResponse.detectedLanguage,
          intent: action.payload.aiResponse.intent,
          confidence: action.payload.aiResponse.confidence,
          needsClarification: action.payload.aiResponse.needsClarification,
          clarificationQuestion: action.payload.aiResponse.clarificationQuestion,
          memoryUsed: action.payload.aiResponse.memoryUsed,
          memoryReferences: action.payload.aiResponse.memoryReferences,
          suggestedNextActions: action.payload.aiResponse.suggestedNextActions,
          plannedSteps: action.payload.aiResponse.plannedSteps,
          activityTimeline: action.payload.aiResponse.activityTimeline,
          toolUsed: action.payload.aiResponse.toolUsed,
          toolResult: action.payload.aiResponse.toolResult,
          actionRequired: action.payload.aiResponse.actionRequired,
          confirmationPayload: action.payload.aiResponse.confirmationPayload,
          uiAction: action.payload.aiResponse.uiAction,
          formFill: action.payload.aiResponse.formFill,
          taskCreated: action.payload.aiResponse.taskCreated,
          success: action.payload.aiResponse.success,
          successType: action.payload.aiResponse.successType,
          successMessage: action.payload.aiResponse.successMessage,
          createdTask: action.payload.aiResponse.createdTask,
          relatedRecord: action.payload.aiResponse.relatedRecord,
          cards: action.payload.aiResponse.cards,
          timestamp: new Date().toISOString(),
        });
      })
      .addCase(sendVoiceCommand.rejected, (state, action) => {
        state.isTyping = false;
        state.error = action.payload;
      })
      // Clear memory
      .addCase(clearMemory.fulfilled, (state) => {
        state.messages = [];
      });
  },
});

export const { setLanguage, clearMessages, clearError, appendAssistantMessage } = chatSlice.actions;
export default chatSlice.reducer;
