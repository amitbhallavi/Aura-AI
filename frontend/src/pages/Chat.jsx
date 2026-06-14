import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import { appendAssistantMessage, clearMessages, sendMessage, sendVoiceCommand } from "../features/chat/chatSlice";
import { fetchCalls } from "../features/calls/callSlice";
import { fetchTasks } from "../features/tasks/taskSlice";
import VoiceCommanderPanel from "../components/VoiceCommander/VoiceCommanderPanel";
import AIMessageWriter from "../components/AIMessageWriter";
import LocationResultsGrid from "../components/Chat/LocationResultsGrid";
import MemoryReferencePill from "../components/Chat/MemoryReferencePill";
import SuccessResultCard from "../components/Chat/SuccessResultCard";
import api, { connectionsAPI, getRequestErrorMessage, gmailAPI, voiceAPI } from "../services/api";
import { preserveMultilineBody, safeTrimSingleLine } from "../utils/textFormat";

const LOCATION_RE = /(near me|nearby|aas paas|आस पास|mere aas paas|restaurant|restaurants|gym|cafe|hospital|shop|shops|store|place batao)/i;

const AI_MODEL_OPTIONS = [
  { value: "auto-gemini-flash", label: "Auto: Gemini Flash" },
  { value: "gemini-2.5-flash", label: "Gemini Flash" },
  { value: "gemini-2.5-pro", label: "Gemini Pro" },
  { value: "groq-llama", label: "Groq Llama" },
];
const AI_MODEL_STORAGE_KEY = "aura_ai_model";
const AI_MODEL_MIGRATION_KEY = "aura_ai_model_migrated_v2";
const STALE_AI_MODEL_VALUES = new Set([
  "auto",
  "gemini",
  "gemini-flash",
  "gemini-pro",
  "groq",
  "llama",
  "llama-3.3-70b-versatile",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
]);

function isValidAiModel(model) {
  return AI_MODEL_OPTIONS.some((option) => option.value === model);
}

function getInitialAiModel() {
  try {
    const savedModel = localStorage.getItem(AI_MODEL_STORAGE_KEY);
    const migrated = localStorage.getItem(AI_MODEL_MIGRATION_KEY) === "true";
    const shouldReset = !isValidAiModel(savedModel) || STALE_AI_MODEL_VALUES.has(savedModel);
    const nextModel = shouldReset ? "auto-gemini-flash" : savedModel;

    if (!migrated || shouldReset) {
      localStorage.setItem(AI_MODEL_STORAGE_KEY, nextModel);
      localStorage.setItem(AI_MODEL_MIGRATION_KEY, "true");
    }

    return nextModel;
  } catch {
    return "auto-gemini-flash";
  }
}

function getAiProviderForModel(model) {
  if (model === "groq-llama") return "groq";
  if (String(model || "").startsWith("gemini-")) return "gemini";
  return "auto";
}

function splitSpeechText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .match(/.{1,180}(\s|$)/g) || [];
}

function isPlace(item) {
  return item?.placeId || item?.mapsUrl;
}

function isCalendarEvent(item) {
  return item?.start || item?.startTime || item?.summary;
}

function isScheduledEmail(item) {
  return item?.scheduledFor && item?.to;
}

function renderInlineText(text, keyPrefix, tone = "assistant") {
  const strongClass = tone === "user" ? "font-semibold text-current" : "font-semibold text-[color:var(--text-primary)]";
  return String(text || "")
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, index) => {
      if (/^\*\*[^*]+\*\*$/.test(part)) {
        return <strong key={`${keyPrefix}-bold-${index}`} className={strongClass}>{part.slice(2, -2)}</strong>;
      }
      return <span key={`${keyPrefix}-text-${index}`}>{part}</span>;
    });
}

function renderTextBlock(text, keyPrefix, tone = "assistant") {
  const lines = String(text || "").split("\n");
  const elements = [];
  let paragraph = [];
  let list = [];
  let listType = null;
  const textClass = tone === "user" ? "text-current" : "text-[color:var(--text-primary)]";

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const content = paragraph.join(" ").trim();
    if (content) {
      elements.push(
        <p key={`${keyPrefix}-p-${elements.length}`} className={`leading-7 ${textClass}`}>
          {renderInlineText(content, `${keyPrefix}-p-${elements.length}`, tone)}
        </p>
      );
    }
    paragraph = [];
  };

  const flushList = () => {
    if (!list.length) return;
    const Tag = listType === "ordered" ? "ol" : "ul";
    const listClass = listType === "ordered" ? "list-decimal" : "list-disc";
    elements.push(
      <Tag key={`${keyPrefix}-list-${elements.length}`} className={`${listClass} space-y-1.5 pl-5 leading-7 ${textClass}`}>
        {list.map((item, index) => (
          <li key={`${keyPrefix}-li-${index}`}>{renderInlineText(item, `${keyPrefix}-li-${index}`, tone)}</li>
        ))}
      </Tag>
    );
    list = [];
    listType = null;
  };

  lines.forEach((line, lineIndex) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const size = heading[1].length === 1 ? "text-lg" : "text-base";
      elements.push(
        <h3 key={`${keyPrefix}-h-${lineIndex}`} className={`${size} pt-2 font-semibold ${textClass}`}>
          {renderInlineText(heading[2], `${keyPrefix}-h-${lineIndex}`, tone)}
        </h3>
      );
      return;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      if (listType && listType !== "bullet") flushList();
      listType = "bullet";
      list.push(bullet[1]);
      return;
    }

    const numbered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (numbered) {
      flushParagraph();
      if (listType && listType !== "ordered") flushList();
      listType = "ordered";
      list.push(numbered[1]);
      return;
    }

    flushList();
    paragraph.push(trimmed);
  });

  flushParagraph();
  flushList();
  return elements;
}

function renderMessageContent(text, tone = "assistant") {
  const parts = String(text || "").split(/```([\s\S]*?)```/g);
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      const language = part.match(/^(\w+)\n/)?.[1];
      const code = part.replace(/^\w+\n/, "");
      const codeShellClass = tone === "user"
        ? "my-3 overflow-hidden rounded-2xl border border-white/20 bg-white/10 text-white"
        : "my-3 overflow-hidden rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)]";
      const codeHeaderClass = tone === "user"
        ? "flex items-center justify-between border-b border-white/20 px-3 py-2 text-[11px] text-white/80"
        : "flex items-center justify-between border-b border-[color:var(--border)] px-3 py-2 text-[11px] text-[color:var(--text-muted)]";
      const codeButtonClass = tone === "user"
        ? "rounded-lg border border-white/20 px-2 py-1 text-white/80"
        : "rounded-lg border border-[color:var(--border)] px-2 py-1 text-[color:var(--text-secondary)]";
      const codeTextClass = tone === "user" ? "text-white" : "text-[color:var(--text-primary)]";
      return (
        <div key={index} className={codeShellClass}>
          <div className={codeHeaderClass}>
            <span>{language || "code"}</span>
            <button onClick={() => navigator.clipboard?.writeText(code.trim())} className={codeButtonClass}>Copy</button>
          </div>
          <pre className={`overflow-x-auto p-3 text-xs leading-relaxed ${codeTextClass}`}>
            <code>{code.trim()}</code>
          </pre>
        </div>
      );
    }

    return renderTextBlock(part, `part-${index}`, tone);
  });
}

function connectionPillClass(connected) {
  return connected
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
    : "border-amber-400/20 bg-amber-400/10 text-amber-600";
}

function getChatSessionId() {
  const key = "aura_chat_session";
  let sessionId = localStorage.getItem(key);
  if (!sessionId) {
    sessionId = `chat_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, sessionId);
  }
  return sessionId;
}

function successFromConfirmation(type, response = {}) {
  const map = {
    gmail_send: ["email_sent", "Email sent successfully."],
    gmail_schedule: ["email_scheduled", "Email scheduled successfully."],
    gmail_update_schedule: ["email_schedule_updated", "Scheduled email updated successfully."],
    gmail_cancel_schedule: ["email_schedule_cancelled", "Scheduled email cancelled."],
    calendar_create: ["calendar_event_created", "Calendar event created successfully."],
    calendar_update: ["calendar_event_updated", "Calendar event updated successfully."],
    calendar_delete: ["calendar_event_deleted", "Calendar event deleted successfully."],
    call_schedule: ["call_scheduled", "Call scheduled successfully."],
    call_cancel: ["call_cancelled", "Scheduled call cancelled."],
    sms_send: ["message_sent", "SMS sent successfully."],
    whatsapp_send: ["message_sent", "WhatsApp message sent successfully."],
  };
  const [successType, fallbackMessage] = map[type] || ["task_created", "Action completed successfully."];
  return {
    success: true,
    successType: response.successType || successType,
    successMessage: response.successMessage || response.finalText || fallbackMessage,
    createdTask: response.createdTask || response.task || null,
    relatedRecord: response.relatedRecord || response.result || response,
  };
}

function getTypingTimeline(responseMode) {
  const steps = ["Understanding your request", "Detecting intent", "Planning steps"];
  if (responseMode === "deep-explain") steps.push("Building deep explanation");
  if (responseMode === "step-by-step") steps.push("Structuring answer step by step");
  if (responseMode === "quick") steps.push("Preparing short answer");
  steps.push("Checking tools if needed");
  return steps;
}

function shouldShowActivity(message) {
  return Boolean(
    message?.toolUsed ||
    message?.actionRequired ||
    message?.success ||
    message?.needsClarification ||
    message?.uiAction ||
    message?.formFill
  );
}

function shouldShowPlannedSteps(message) {
  return Boolean(
    message?.actionRequired ||
    message?.toolUsed ||
    message?.needsClarification
  );
}

export default function Chat() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const { messages, isTyping, error } = useSelector((s) => s.chat);
  const { user } = useSelector((s) => s.auth);
  const [input, setInput] = useState("");
  const [voiceReply, setVoiceReply] = useState(() => localStorage.getItem("aura_voice_reply") === "true");
  const [responseMode, setResponseMode] = useState(() => localStorage.getItem("aura_response_mode") || "normal");
  const [aiModel, setAiModel] = useState(getInitialAiModel);
  const [speechStatus, setSpeechStatus] = useState("idle");
  const [speakingIndex, setSpeakingIndex] = useState(null);
  const [locationPrompt, setLocationPrompt] = useState(null);
  const [locationPromptMode, setLocationPromptMode] = useState("text");
  const [pendingVoiceCommand, setPendingVoiceCommand] = useState(null);
  const [manualLocation, setManualLocation] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [confirmationForm, setConfirmationForm] = useState({});
  const [confirmingAction, setConfirmingAction] = useState(false);
  const [toast, setToast] = useState("");
  const [scheduledEmails, setScheduledEmails] = useState([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [connections, setConnections] = useState(null);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const bottomRef = useRef(null);
  const speechQueueRef = useRef([]);
  const autoSpokenRef = useRef(null);
  const audioRef = useRef(null);
  const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

  const latestAssistant = useMemo(
    () => [...messages].reverse().find((msg) => msg.role === "assistant"),
    [messages]
  );
  const gmailConnection = connections?.gmail;
  const gmailConnected = Boolean(gmailConnection?.connected);
  const coreServices = useMemo(() => (
    ["gemini", "gmail", "calendar", "maps"].map((key) => ({
      key,
      label: connections?.[key]?.label || ({ gemini: "AI Provider", gmail: "Gmail", calendar: "Calendar", maps: "Maps" }[key]),
      connected: Boolean(connections?.[key]?.connected),
      status: connections?.[key]?.status || (loadingConnections ? "checking" : "unknown"),
    }))
  ), [connections, loadingConnections]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    localStorage.setItem("aura_voice_reply", String(voiceReply));
  }, [voiceReply]);

  useEffect(() => {
    localStorage.setItem("aura_response_mode", String(responseMode));
  }, [responseMode]);

  useEffect(() => {
    localStorage.setItem(AI_MODEL_STORAGE_KEY, String(aiModel));
  }, [aiModel]);

  useEffect(() => {
    refreshConnections();
    refreshScheduledEmails();
    const params = new URLSearchParams(window.location.search);
    if (params.get("gmail") === "connected") {
      showToast("Gmail connected.");
      refreshConnections({ force: true });
    }
    if (params.get("gmail") === "error") showToast(params.get("reason") || "Gmail connection failed.");
    if (params.has("gmail")) window.history.replaceState({}, "", "/chat");
  }, []);

  useEffect(() => {
    if (!latestAssistant?.actionRequired || !latestAssistant.confirmationPayload) return;
    setConfirmation(latestAssistant.confirmationPayload);
    setConfirmationForm(latestAssistant.confirmationPayload.data || {});
  }, [latestAssistant?.timestamp]);

  useEffect(() => {
    if (!latestAssistant?.uiAction) return;
    handleUiAction(latestAssistant.uiAction);
  }, [latestAssistant?.timestamp]);

  useEffect(() => {
    if (!latestAssistant?.formFill) return;
    handleFormFill(latestAssistant.formFill);
  }, [latestAssistant?.timestamp]);

  useEffect(() => {
    if (!voiceReply || !latestAssistant?.content || latestAssistant.timestamp === autoSpokenRef.current) return;
    autoSpokenRef.current = latestAssistant.timestamp;
    speakAssistantMessage(latestAssistant, messages.length - 1);
  }, [latestAssistant?.timestamp, voiceReply]);

  function showToast(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3500);
  }

  async function refreshConnections(options = {}) {
    setLoadingConnections(true);
    try {
      const res = await connectionsAPI.status(options);
      setConnections(res.data || null);
    } catch (err) {
      showToast(getRequestErrorMessage(err, "Could not refresh connections."));
      setConnections(null);
    } finally {
      setLoadingConnections(false);
    }
  }

  async function refreshScheduledEmails(options = {}) {
    setLoadingSchedules(true);
    try {
      const res = await gmailAPI.listScheduled(options);
      setScheduledEmails(res.data || []);
    } catch (err) {
      showToast(getRequestErrorMessage(err, "Could not refresh scheduled emails."));
      setScheduledEmails([]);
    } finally {
      setLoadingSchedules(false);
    }
  }

  async function copyAssistantText(text) {
    if (!text) return;
    try {
      await navigator.clipboard?.writeText(text);
      showToast("Response copied.");
    } catch {
      showToast("Copy failed.");
    }
  }

  function speak(text, index) {
    if (!speechSupported) {
      showToast("Voice reply is not supported in this browser.");
      return;
    }

    stopAudioPlayback();
    window.speechSynthesis.cancel();
    speechQueueRef.current = splitSpeechText(text);
    setSpeakingIndex(index);
    setSpeechStatus("playing");

    const playNext = () => {
      const next = speechQueueRef.current.shift();
      if (!next) {
        setSpeechStatus("idle");
        setSpeakingIndex(null);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(next);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.onend = playNext;
      utterance.onerror = () => {
        setSpeechStatus("idle");
        setSpeakingIndex(null);
      };
      window.speechSynthesis.speak(utterance);
    };

    playNext();
  }

  function stopAudioPlayback() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  }

  function playBackendAudio(ttsAudio, index, fallbackText = "") {
    if (!ttsAudio?.audioBase64) return false;
    stopSpeech();
    const audio = new Audio(`data:${ttsAudio.contentType || "audio/mpeg"};base64,${ttsAudio.audioBase64}`);
    audioRef.current = audio;
    setSpeakingIndex(index);
    setSpeechStatus("playing");
    audio.onended = () => {
      setSpeechStatus("idle");
      setSpeakingIndex(null);
      audioRef.current = null;
    };
    audio.onerror = () => {
      setSpeechStatus("idle");
      setSpeakingIndex(null);
      audioRef.current = null;
    };
    audio.play().catch(() => speak(fallbackText || ttsAudio.fallbackText || "", index));
    return true;
  }

  async function speakWithBackendOrBrowser(text, language, index) {
    try {
      const res = await voiceAPI.tts({ text, language });
      const contentType = res.headers?.["content-type"] || "";
      if (contentType.includes("audio") && res.data?.byteLength) {
        const bytes = new Uint8Array(res.data);
        let binary = "";
        bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
        return playBackendAudio({
          contentType,
          audioBase64: window.btoa(binary),
        }, index, text);
      }
    } catch {
      // Browser speech is the intended fallback.
    }
    speak(text, index);
    return false;
  }

  function speakAssistantMessage(message, index) {
    const text = message?.spokenText || message?.content;
    if (!text) return;
    if (message?.ttsAudio?.audioBase64 && playBackendAudio(message.ttsAudio, index, text)) return;
    speakWithBackendOrBrowser(text, message?.detectedLanguage || user?.language || "en-IN", index);
  }

  function pauseSpeech() {
    if (audioRef.current) {
      audioRef.current.pause();
      setSpeechStatus("paused");
      return;
    }
    if (!speechSupported) return;
    window.speechSynthesis.pause();
    setSpeechStatus("paused");
  }

  function resumeSpeech() {
    if (audioRef.current) {
      audioRef.current.play();
      setSpeechStatus("playing");
      return;
    }
    if (!speechSupported) return;
    window.speechSynthesis.resume();
    setSpeechStatus("playing");
  }

  function stopSpeech() {
    stopAudioPlayback();
    if (speechSupported) window.speechSynthesis.cancel();
    setSpeechStatus("idle");
    setSpeakingIndex(null);
  }

  function getLocationForPrompt(message) {
    if (!LOCATION_RE.test(message)) return Promise.resolve(null);
    if (!navigator.geolocation) {
      return Promise.resolve({ locationText: "" });
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
        () => resolve({ denied: true }),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  async function runSend(message, location) {
    const history = messages
      .filter((msg) => msg.content)
      .slice(-8)
      .map((msg) => ({ role: msg.role, content: msg.content }));

    await dispatch(sendMessage({
      message,
      sessionId: getChatSessionId(),
      history,
      voiceMode: voiceReply,
      responseMode,
      stepByStepMode: responseMode === "step-by-step",
      location,
      language: user?.language,
      aiProvider: getAiProviderForModel(aiModel),
      aiModel,
      clientContext: {
        sessionId: getChatSessionId(),
        now: new Date().toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
        aiModel,
      },
    }));
  }

  async function runVoiceSend({ transcript, detectedLanguage, voiceMode, sessionId, location }) {
    const voiceResponseMode = ["deep-explain", "step-by-step"].includes(responseMode) ? responseMode : "quick";
    const history = messages
      .filter((msg) => msg.content)
      .slice(-3)
      .map((msg) => ({ role: msg.role, content: msg.content }));

    await dispatch(sendVoiceCommand({
      transcript,
      detectedLanguage,
      voiceMode,
      sessionId: sessionId || getChatSessionId(),
      history,
      voiceReply,
      responseMode: voiceResponseMode,
      location,
      aiProvider: "auto",
      aiModel: "auto-gemini-flash",
      clientContext: {
        sessionId: sessionId || getChatSessionId(),
        now: new Date().toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
        currentPage: routeLocation.pathname,
        aiModel: "auto-gemini-flash",
        voiceOptimized: true,
      },
      currentPage: routeLocation.pathname,
      pageContext: {
        chatInput: input,
        responseMode: voiceResponseMode,
        aiModel: "auto-gemini-flash",
      },
    }));
  }

  async function handleUiAction(action) {
    if (!action?.type) return;
    if (action.type === "fill_chat_input") {
      setInput(action.value || "");
      showToast("Prompt filled into chat input.");
    }
    if (action.type === "open_page" && action.path) {
      if (action.selectPlan) localStorage.setItem("aura_selected_plan", action.selectPlan);
      navigate(action.path);
    }
    if (action.type === "navigate" && action.path) {
      navigate(action.path);
    }
    if (action.type === "connect_service" && action.path) {
      if (!action.path.startsWith("/api")) {
        navigate(action.path);
        return;
      }
      try {
        const res = await api.get(action.path.replace(/^\/api/, ""));
        if (res.data?.url) window.location.href = res.data.url;
      } catch {
        showToast("Could not start service connection.");
      }
    }
    if (action.type === "show_toast") showToast(action.message || "Action prepared.");
  }

  function handleFormFill(formFill) {
    if (!formFill?.page || !formFill.fields) return;
    localStorage.setItem("aura_pending_form_fill", JSON.stringify({
      ...formFill,
      createdAt: Date.now(),
    }));
    showToast("Form fill prepared. Review before submitting.");
    if (formFill.page !== routeLocation.pathname) navigate(formFill.page);
  }

  async function sendPreparedMessage(rawMessage) {
    const message = preserveMultilineBody(rawMessage);
    if (!message.trim() || isTyping) return;

    const location = await getLocationForPrompt(message);
    if (location?.denied || location?.locationText === "") {
      setInput(message);
      setLocationPrompt(message);
      setLocationPromptMode("text");
      return;
    }

    setInput("");
    await runSend(message, location);
  }

  async function handleSend() {
    await sendPreparedMessage(input);
  }

  async function handleAiSendDirect(generatedText) {
    setInput(generatedText);
    await sendPreparedMessage(generatedText);
  }

  async function handleManualLocationSubmit() {
    if (!locationPrompt || !manualLocation.trim()) return;
    const message = preserveMultilineBody(locationPrompt);
    setInput("");
    setLocationPrompt(null);
    setManualLocation("");
    if (locationPromptMode === "voice" && pendingVoiceCommand) {
      const command = pendingVoiceCommand;
      setPendingVoiceCommand(null);
      setLocationPromptMode("text");
      await runVoiceSend({ ...command, location: { locationText: safeTrimSingleLine(manualLocation) } });
      return;
    }
    await runSend(message, { locationText: safeTrimSingleLine(manualLocation) });
  }

  function refreshAfterConfirmedAction(type) {
    if (type?.startsWith("gmail")) refreshScheduledEmails({ force: true });
    if (type?.startsWith("call")) dispatch(fetchCalls({ force: true }));
    dispatch(fetchTasks({ force: true }));
    refreshConnections({ force: true });
  }

  async function handleVoiceTranscript(command) {
    const location = await getLocationForPrompt(command.transcript);
    if (location?.denied || location?.locationText === "") {
      setLocationPrompt(command.transcript);
      setLocationPromptMode("voice");
      setPendingVoiceCommand(command);
      return;
    }
    await runVoiceSend({ ...command, location });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleConfirmAction() {
    if (!confirmation || confirmingAction) return;
    setConfirmingAction(true);
    try {
      if (confirmation.actionId) {
        const res = await api.post("/ai/confirm-action", {
          sessionId: confirmation.sessionId || pendingVoiceCommand?.sessionId || localStorage.getItem("aura_voice_session"),
          actionId: confirmation.actionId,
          decision: "confirm",
          editedData: confirmationForm,
        });
        const success = successFromConfirmation(confirmation.type, res.data || {});
        showToast(success.successMessage);
        dispatch(appendAssistantMessage({
          content: res.data?.finalText || success.successMessage,
          ...success,
          toolUsed: confirmation.type,
          activityTimeline: ["Confirmed pending action", "Executed action", "Updated task/service status"],
        }));
        setConfirmation(null);
        setConfirmationForm({});
        refreshAfterConfirmedAction(confirmation.type);
        return res.data;
      }

      const request = {
        method: confirmation.method,
        url: confirmation.path,
      };

      if (confirmation.method !== "DELETE") request.data = confirmationForm;
      const res = await api.request(request);
      const success = successFromConfirmation(confirmation.type, res.data || {});
      showToast(success.successMessage);
      dispatch(appendAssistantMessage({
        content: success.successMessage,
        ...success,
        toolUsed: confirmation.type,
        activityTimeline: ["Confirmed pending action", "Executed action", "Updated task/service status"],
      }));
      setConfirmation(null);
      setConfirmationForm({});
      refreshAfterConfirmedAction(confirmation.type);
      return res.data;
    } catch (err) {
      showToast(err.response?.data?.error || "Action failed.");
    } finally {
      setConfirmingAction(false);
    }
  }

  async function handleCancelConfirmation() {
    if (confirmation?.actionId) {
      try {
        await api.post("/ai/confirm-action", {
          sessionId: confirmation.sessionId || localStorage.getItem("aura_voice_session"),
          actionId: confirmation.actionId,
          decision: "cancel",
        });
      } catch {
        // UI cancel should still clear the local pending state.
      }
    }
    setConfirmation(null);
    setConfirmationForm({});
    showToast("Action cancelled.");
  }

  async function connectGmail() {
    try {
      const res = await gmailAPI.getAuthUrl();
      window.location.href = res.data.url;
    } catch {
      showToast("Could not start Gmail connection.");
    }
  }

  async function cancelScheduledEmail(id) {
    try {
      await gmailAPI.cancelScheduled(id);
      showToast("Scheduled email cancelled.");
      refreshScheduledEmails({ force: true });
    } catch {
      showToast("Could not cancel scheduled email.");
    }
  }

  function editScheduledEmail(email) {
    setConfirmation({
      type: "gmail_update_schedule",
      title: "Edit scheduled email?",
      method: "PUT",
      path: `/gmail/scheduled/${email._id}`,
      data: {
        to: email.to,
        subject: email.subject,
        body: email.body,
        scheduledFor: email.scheduledFor,
        timezone: email.timezone,
        recurrence: email.recurrence,
      },
    });
    setConfirmationForm({
      to: email.to,
      subject: email.subject,
      body: email.body,
      scheduledFor: email.scheduledFor,
      timezone: email.timezone,
      recurrence: email.recurrence,
    });
  }

  function renderCards(cards) {
    if (!cards?.items?.length) return null;

    const items = cards.items;
    if (cards.type === "location_results" || cards.type === "places" || items.some(isPlace)) {
      return (
        <LocationResultsGrid
          query={cards.query}
          locationLabel={cards.locationLabel}
          places={items.filter(isPlace)}
          onAction={(prompt) => setInput(prompt)}
        />
      );
    }

    if (cards.type === "calendar" || items.some(isCalendarEvent)) {
      return (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.filter(isCalendarEvent).map((event) => (
            <div key={event.id || event.summary} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-4">
              <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">{event.summary || event.title}</h3>
              <p className="mt-1 text-xs text-[color:var(--text-secondary)]">{event.description || "No description"}</p>
              <p className="mt-3 text-xs font-medium text-[color:var(--accent)]">{event.start?.dateTime || event.startTime} → {event.end?.dateTime || event.endTime}</p>
            </div>
          ))}
        </div>
      );
    }

    if (cards.type === "emailDraft") {
      const draft = items[0] || {};
      return (
        <div className="mt-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-[color:var(--text-muted)]">Email draft</p>
              <h3 className="mt-1 text-sm font-semibold text-[color:var(--text-primary)]">{draft.subject}</h3>
              <p className="mt-2 text-xs text-[color:var(--text-secondary)]">To: {draft.to}</p>
            </div>
            <span className="rounded-full bg-amber-400/10 px-2 py-1 text-[10px] font-medium text-amber-600">Draft ready</span>
          </div>
          <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-3 text-sm leading-relaxed text-[color:var(--text-secondary)]">{draft.body}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => navigator.clipboard?.writeText(draft.body || "")} className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--text-secondary)]">Copy body</button>
            <button onClick={() => sendPreparedMessage(`Send this draft to ${draft.to}`)} className="rounded-xl bg-violet-500 px-3 py-2 text-xs font-medium text-white">Send</button>
            <button onClick={() => sendPreparedMessage("Schedule this draft tomorrow 10 AM")} className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--text-secondary)]">Schedule</button>
          </div>
        </div>
      );
    }

    if (cards.type === "scheduledEmails" || items.some(isScheduledEmail)) {
      return (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.filter(isScheduledEmail).map((email) => (
            <div key={email._id || `${email.to}-${email.scheduledFor}`} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-4">
              <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">{email.subject}</h3>
              <p className="mt-1 text-xs text-[color:var(--text-secondary)]">To: {email.to}</p>
              <p className="mt-2 text-xs text-[color:var(--accent)]">{new Date(email.scheduledFor).toLocaleString("en-IN")}</p>
              <span className="mt-3 inline-flex rounded-full bg-[color:var(--accent-bg)] px-2 py-1 text-[10px] text-[color:var(--accent)]">{email.status}</span>
            </div>
          ))}
        </div>
      );
    }

    if (cards.type === "taskPlan") {
      return (
        <div className="mt-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-4">
          <p className="text-xs font-medium text-[color:var(--text-primary)]">Task plan</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-[color:var(--text-secondary)]">
            {items.map((item, idx) => <li key={idx}>{item.step || item}</li>)}
          </ol>
        </div>
      );
    }

    if (cards.type === "connections") {
      return (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.map((service) => (
            <div key={service.key || service.label} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">{service.label || service.key}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-secondary)]">{service.explanation || "Service status checked."}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${service.connected ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-400/10 text-amber-600"}`}>
                  {service.connected ? "Connected" : service.status || "Setup needed"}
                </span>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (cards.type === "tasks") {
      return (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.map((task) => (
            <div key={task.id || task.title} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">{task.title}</h3>
                <span className="rounded-full bg-[color:var(--accent-bg)] px-2 py-1 text-[10px] text-[color:var(--accent)]">{task.type || "task"}</span>
              </div>
              {task.remind_at && <p className="mt-2 text-xs text-[color:var(--text-secondary)]">Reminder: {new Date(task.remind_at).toLocaleString("en-IN")}</p>}
              {task.related_service && <p className="mt-1 text-xs text-[color:var(--text-muted)]">Service: {task.related_service}</p>}
            </div>
          ))}
        </div>
      );
    }

    if (cards.type === "calls") {
      return (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {items.map((call) => (
            <div key={call.id || call.phone_number} className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-4">
              <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">{call.contact_name || call.phone_number}</h3>
              <p className="mt-1 text-xs text-[color:var(--text-secondary)]">{call.purpose || "general"} · {call.scheduled_at ? new Date(call.scheduled_at).toLocaleString("en-IN") : "No time"}</p>
              <span className="mt-3 inline-flex rounded-full bg-[color:var(--accent-bg)] px-2 py-1 text-[10px] text-[color:var(--accent)]">{call.status}</span>
            </div>
          ))}
        </div>
      );
    }

    if (cards.type === "prompt") {
      return (
        <div className="mt-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-surface)] p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-medium text-[color:var(--text-primary)]">Prompt for {items[0].targetTool}</p>
            <button onClick={() => navigator.clipboard?.writeText(items[0].prompt)} className="rounded-lg border border-[color:var(--border)] px-2 py-1 text-[11px] text-[color:var(--text-secondary)]">Copy</button>
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-[color:var(--bg-elevated)] p-3 text-xs leading-relaxed text-[color:var(--text-secondary)]">{items[0].prompt}</pre>
          <button onClick={() => setInput(items[0].prompt)} className="mt-3 rounded-xl bg-violet-500 px-3 py-2 text-xs font-medium text-white">Fill in chat input</button>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="flex h-full flex-col bg-[color:var(--bg-base)] text-[color:var(--text-primary)] md:flex-row">
      {toast && (
        <div className="fixed right-4 top-4 z-50 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] px-4 py-3 text-sm text-[color:var(--text-primary)] shadow-xl">
          {toast}
        </div>
      )}

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-[color:var(--border)] bg-[color:var(--bg-surface)] px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-base font-semibold">Aura AI Agent</h1>
              <p className="text-xs text-[color:var(--text-muted)]">Aura tools: Maps, Gmail, Calendar, voice, step mode</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setVoiceReply((v) => !v)} className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors ${voiceReply ? "border-emerald-500/30 bg-emerald-500/10 text-[color:var(--online)]" : "border-[color:var(--border)] bg-[color:var(--bg-elevated)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-hover)] hover:text-[color:var(--text-primary)]"}`}>
                Voice Reply {voiceReply ? "ON" : "OFF"}
              </button>
              <label className="flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-3 py-2 text-xs text-[color:var(--text-secondary)]">
                Mode
                <select value={responseMode} onChange={(e) => setResponseMode(e.target.value)} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-base)] px-2 py-1 text-xs text-[color:var(--text-primary)] outline-none">
                  <option value="normal">Normal</option>
                  <option value="step-by-step">Step-by-Step</option>
                  <option value="deep-explain">Deep Explain</option>
                  <option value="quick">Quick</option>
                </select>
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-3 py-2 text-xs text-[color:var(--text-secondary)]">
                Model
                <select value={aiModel} onChange={(e) => setAiModel(e.target.value)} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-base)] px-2 py-1 text-xs text-[color:var(--text-primary)] outline-none">
                  {AI_MODEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <button onClick={() => dispatch(clearMessages())} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-3 py-2 text-xs text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--border-hover)] hover:text-[color:var(--text-primary)]">
                Clear
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {coreServices.map((service) => (
              <span key={service.key} className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${connectionPillClass(service.connected)}`}>
                {service.label}: {service.connected ? "Ready" : service.status === "checking" ? "Checking" : "Needs setup"}
              </span>
            ))}
            <button onClick={() => refreshConnections({ force: true })} disabled={loadingConnections} className="rounded-full border border-[color:var(--border)] px-2.5 py-1 text-[11px] text-[color:var(--text-secondary)] disabled:opacity-50">
              Refresh status
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {messages.length === 0 && (
            <div className="mx-auto flex h-full max-w-2xl flex-col justify-center text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[color:var(--accent-bg)] text-2xl text-[color:var(--accent)]">✦</div>
              <h2 className="text-2xl font-semibold">Ask Aura to do real work</h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[color:var(--text-secondary)]">
                Try nearby search, calendar actions, Gmail drafts, scheduled emails, or normal questions. Sensitive actions always need your confirmation first.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {[
                  "Mujhe nearby shops batao",
                  "Kal 5 PM meeting calendar me add karo",
                  "Client ko kal 10 baje project update email schedule kar do",
                  "Mere aas paas best gym search karo",
                ].map((prompt) => (
                  <button key={prompt} onClick={() => setInput(prompt)} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-3 py-2 text-xs text-[color:var(--text-secondary)] transition-colors hover:border-[color:var(--border-hover)] hover:text-[color:var(--text-primary)]">
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mx-auto max-w-4xl space-y-5">
            {messages.map((msg, index) => (
              <div key={`${msg.timestamp}-${index}`} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[92%] md:max-w-[78%] ${msg.role === "user" ? "order-2" : ""}`}>
                  <div
                    className={`rounded-2xl border px-4 py-3 text-sm leading-relaxed shadow-sm ${msg.role === "user" ? "border-[color:var(--accent-border)] bg-[color:var(--accent)] text-white" : "border-[color:var(--border)] bg-[color:var(--bg-card)] text-[color:var(--text-primary)]"}`}
                    style={msg.role === "user" ? { color: "#ffffff" } : undefined}
                  >
                    {msg.role === "assistant" && (
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[color:var(--border)] pb-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-[color:var(--accent-bg)] text-[color:var(--accent)]">✦</span>
                          <div>
                            <div className="text-xs font-semibold text-[color:var(--text-primary)]">Aura AI</div>
                            <div className="text-[11px] text-[color:var(--text-muted)]">Aura AI assistant</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          {msg.memoryUsed && <span className="rounded-full bg-sky-400/10 px-2 py-1 text-sky-600">Used memory</span>}
                          {msg.toolUsed && <span className="rounded-full bg-[color:var(--accent-bg)] px-2 py-1 text-[color:var(--accent)]">Tool used</span>}
                          {msg.actionRequired && <span className="rounded-full bg-amber-400/10 px-2 py-1 text-amber-600">Needs confirmation</span>}
                          <button onClick={() => copyAssistantText(msg.content)} className="rounded-lg border border-[color:var(--border)] px-2 py-1 text-[color:var(--text-secondary)]">Copy</button>
                        </div>
                      </div>
                    )}
                    <div className="space-y-3">{renderMessageContent(msg.content, msg.role === "user" ? "user" : "assistant")}</div>
                    {msg.role === "assistant" && msg.memoryReferences?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {msg.memoryReferences.map((reference, refIndex) => (
                          <MemoryReferencePill key={`${reference.type}-${refIndex}`} reference={reference} />
                        ))}
                      </div>
                    )}
                    {msg.role === "assistant" && msg.success && (
                      <SuccessResultCard
                        successType={msg.successType}
                        message={msg.successMessage}
                        createdTask={msg.createdTask}
                        relatedRecord={msg.relatedRecord}
                        onOpenTasks={() => navigate("/tasks")}
                      />
                    )}
                    {msg.role === "assistant" && renderCards(msg.cards)}
                    {msg.role === "assistant" && shouldShowActivity(msg) && msg.activityTimeline?.length > 0 && (
                      <div className="mt-3 rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] p-3 text-xs text-[color:var(--text-secondary)]">
                        <div className="font-medium text-[color:var(--text-primary)]">Activity</div>
                        <div className="mt-2 space-y-1">
                          {msg.activityTimeline.map((step, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                              <span>{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {msg.role === "assistant" && shouldShowPlannedSteps(msg) && msg.plannedSteps?.length > 0 && (
                      <div className="mt-3 rounded-2xl bg-[color:var(--bg-elevated)] p-3 text-xs text-[color:var(--text-secondary)]">
                        <div className="font-medium text-[color:var(--text-primary)]">Planned steps:</div>
                        <ol className="mt-2 list-decimal space-y-1 pl-5">
                          {msg.plannedSteps.map((step, idx) => (
                            <li key={idx}>{step}</li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {msg.role === "assistant" && msg.actionRequired && (
                      <div className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-600">
                        Pending confirmation: review the modal before Aura changes email, calendar, or scheduled tasks.
                      </div>
                    )}
                    {msg.role === "assistant" && msg.suggestedNextActions?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {msg.suggestedNextActions.map((action, idx) => (
                          <button key={idx} onClick={() => setInput(action)} className="rounded-full border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-3 py-1 text-[11px] text-[color:var(--text-secondary)] hover:border-[color:var(--border-hover)] hover:text-[color:var(--text-primary)]">
                            {action}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 px-1 text-[11px] text-[color:var(--text-muted)]">
                    <span>{new Date(msg.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                    {msg.source === "voice" && <span className="rounded-full bg-[color:var(--accent-bg)] px-2 py-1 text-[color:var(--accent)]">Voice</span>}
                    {msg.intent && <span className="rounded-full bg-[color:var(--bg-elevated)] px-2 py-1 text-[color:var(--text-secondary)]">Intent: {msg.intent}</span>}
                    {msg.confidence && <span className="rounded-full bg-[color:var(--bg-elevated)] px-2 py-1 text-[color:var(--text-secondary)]">{Math.round(msg.confidence * 100)}%</span>}
                    {msg.toolUsed && <span className="rounded-full bg-[color:var(--accent-bg)] px-2 py-1 text-[color:var(--accent)]">Tool: {msg.toolUsed}</span>}
                    {msg.role === "assistant" && (
                      <>
                        <button onClick={() => speakAssistantMessage(msg, index)} className="rounded-lg border border-[color:var(--border)] px-2 py-1 text-[color:var(--text-secondary)]">Play</button>
                        {speakingIndex === index && speechStatus === "playing" && <button onClick={pauseSpeech} className="rounded-lg border border-[color:var(--border)] px-2 py-1 text-[color:var(--text-secondary)]">Pause</button>}
                        {speakingIndex === index && speechStatus === "paused" && <button onClick={resumeSpeech} className="rounded-lg border border-[color:var(--border)] px-2 py-1 text-[color:var(--text-secondary)]">Resume</button>}
                        {speakingIndex === index && speechStatus !== "idle" && <button onClick={stopSpeech} className="rounded-lg border border-[color:var(--border)] px-2 py-1 text-[color:var(--text-secondary)]">Stop</button>}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="rounded-2xl border border-[color:var(--accent-border)] bg-[color:var(--accent-bg)] p-4 text-sm text-[color:var(--accent)]">
                <div className="flex items-center gap-3 font-medium">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-violet-300" />
                  Aura AI is working...
                </div>
                <div className="mt-3 grid gap-2 text-xs text-[color:var(--text-secondary)] sm:grid-cols-2">
                  {getTypingTimeline(responseMode).map((step) => (
                    <div key={step} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-500">{error}</div>}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-[color:var(--border)] bg-[color:var(--bg-surface)] p-4">
          <div className="mx-auto flex max-w-4xl gap-3">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Aura: nearby gym, schedule email, calendar reminder..."
              className="min-h-[46px] flex-1 resize-none rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)] focus:border-[color:var(--accent-border)]"
            />
            <AIMessageWriter
              context="chat"
              panelMode="popover"
              buttonLabel="✨"
              className="flex items-center"
              onUse={(generatedText) => setInput(generatedText)}
              onSendDirect={handleAiSendDirect}
            />
            <button onClick={handleSend} disabled={!input.trim() || isTyping} className="rounded-2xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
              Send
            </button>
          </div>
        </div>
      </section>

      <aside className="w-full border-t border-[color:var(--border)] bg-[color:var(--bg-surface)] p-4 md:w-96 md:border-l md:border-t-0">
        <div className="space-y-4">
          <VoiceCommanderPanel
            voiceReply={voiceReply}
            setVoiceReply={setVoiceReply}
            responseMode={responseMode}
            speechStatus={speechStatus}
            pendingConfirmation={confirmation}
            onTranscript={handleVoiceTranscript}
            onConfirmPending={handleConfirmAction}
            onCancelPending={handleCancelConfirmation}
            onStopSpeech={stopSpeech}
            onPauseSpeech={pauseSpeech}
            onResumeSpeech={resumeSpeech}
            onToast={showToast}
          />

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold">Gmail</h2>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${gmailConnected ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-400/10 text-amber-600"}`}>
                    {loadingConnections ? "Checking" : gmailConnected ? "Connected" : "Not connected"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                  {gmailConnected ? "Ready to send and schedule emails." : "Connect before sending emails."}
                </p>
                <p className="mt-1 text-[11px] text-[color:var(--text-muted)]">
                  {gmailConnected
                    ? "OAuth active for Gmail tools."
                    : gmailConnection?.explanation || "Gmail OAuth is required before Aura can send mail."}
                </p>
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                <button onClick={connectGmail} className={`rounded-xl px-3 py-2 text-xs font-medium ${gmailConnected ? "bg-emerald-500/10 text-emerald-600" : "bg-[color:var(--bg-elevated)] text-[color:var(--text-secondary)]"}`}>
                  {gmailConnected ? "Reconnect" : "Connect"}
                </button>
                <button onClick={() => refreshConnections({ force: true })} disabled={loadingConnections} className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-50">
                  Refresh
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Scheduled Emails</h2>
              <button onClick={() => refreshScheduledEmails({ force: true })} className="text-xs text-[color:var(--accent)]">Refresh</button>
            </div>
            {loadingSchedules ? (
              <p className="text-xs text-[color:var(--text-muted)]">Loading...</p>
            ) : scheduledEmails.length === 0 ? (
              <p className="text-xs text-[color:var(--text-muted)]">No scheduled emails yet.</p>
            ) : (
              <div className="space-y-3">
                {scheduledEmails.slice(0, 5).map((email) => (
                  <div key={email._id} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-[color:var(--text-primary)]">{email.subject}</p>
                        <p className="mt-1 truncate text-[11px] text-[color:var(--text-muted)]">To: {email.to}</p>
                      </div>
                      <span className="rounded-full bg-[color:var(--accent-bg)] px-2 py-1 text-[10px] text-[color:var(--accent)]">{email.status}</span>
                    </div>
                    <p className="mt-2 text-[11px] text-[color:var(--text-muted)]">{new Date(email.scheduledFor).toLocaleString("en-IN")}</p>
                    {email.status === "pending" && (
                      <div className="mt-2 flex gap-3">
                        <button onClick={() => editScheduledEmail(email)} className="text-[11px] text-[color:var(--accent)]">Edit</button>
                        <button onClick={() => cancelScheduledEmail(email._id)} className="text-[11px] text-red-500">Cancel</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>

      {locationPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-3xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-5 text-[color:var(--text-primary)]">
            <h2 className="text-base font-semibold">Location needed</h2>
            <p className="mt-2 text-sm leading-relaxed text-[color:var(--text-secondary)]">Browser location permission denied or unavailable. Enter your city/area so Aura can search nearby places.</p>
            <input value={manualLocation} onChange={(e) => setManualLocation(e.target.value)} placeholder="Example: Indore Vijay Nagar" className="mt-4 w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)]" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setLocationPrompt(null); setPendingVoiceCommand(null); setLocationPromptMode("text"); }} className="rounded-xl border border-[color:var(--border)] px-4 py-2 text-sm text-[color:var(--text-secondary)]">Cancel</button>
              <button onClick={handleManualLocationSubmit} className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-medium text-white">Continue</button>
            </div>
          </div>
        </div>
      )}

      {confirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-5 text-[color:var(--text-primary)]">
            <h2 className="text-lg font-semibold">{confirmation.title}</h2>
            <p className="mt-1 text-sm text-[color:var(--text-secondary)]">Review and edit before confirming. Aura will not do this action without approval.</p>

            <div className="mt-5 space-y-3">
              {confirmation.type?.startsWith("gmail") && confirmation.type !== "gmail_cancel_schedule" && (
                <>
                  <input value={confirmationForm.to || ""} onChange={(e) => setConfirmationForm({ ...confirmationForm, to: e.target.value })} placeholder="To" className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none" />
                  <input value={confirmationForm.subject || ""} onChange={(e) => setConfirmationForm({ ...confirmationForm, subject: e.target.value })} placeholder="Subject" className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none" />
                  {confirmation.type === "gmail_schedule" && (
                    <input type="datetime-local" value={confirmationForm.scheduledFor?.slice(0, 16) || ""} onChange={(e) => setConfirmationForm({ ...confirmationForm, scheduledFor: e.target.value })} className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none" />
                  )}
                  <textarea value={confirmationForm.body || ""} onChange={(e) => setConfirmationForm({ ...confirmationForm, body: e.target.value })} rows={8} placeholder="Body" className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none" />
                </>
              )}

              {confirmation.type?.startsWith("calendar") && confirmation.type !== "calendar_delete" && (
                <>
                  <input value={confirmationForm.title || ""} onChange={(e) => setConfirmationForm({ ...confirmationForm, title: e.target.value })} placeholder="Title" className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none" />
                  <input type="datetime-local" value={confirmationForm.startTime?.slice(0, 16) || ""} onChange={(e) => setConfirmationForm({ ...confirmationForm, startTime: e.target.value })} className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none" />
                  <input type="datetime-local" value={confirmationForm.endTime?.slice(0, 16) || ""} onChange={(e) => setConfirmationForm({ ...confirmationForm, endTime: e.target.value })} className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none" />
                  <textarea value={confirmationForm.description || ""} onChange={(e) => setConfirmationForm({ ...confirmationForm, description: e.target.value })} rows={4} placeholder="Description" className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none" />
                </>
              )}

              {confirmation.type === "call_schedule" && (
                <>
                  <input value={confirmationForm.phoneNumber || ""} onChange={(e) => setConfirmationForm({ ...confirmationForm, phoneNumber: e.target.value })} placeholder="Phone number" className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none" />
                  <input value={confirmationForm.contactName || ""} onChange={(e) => setConfirmationForm({ ...confirmationForm, contactName: e.target.value })} placeholder="Contact name" className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none" />
                  <input type="datetime-local" value={confirmationForm.scheduledAt?.slice(0, 16) || ""} onChange={(e) => setConfirmationForm({ ...confirmationForm, scheduledAt: e.target.value })} className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none" />
                  <textarea value={confirmationForm.message || ""} onChange={(e) => setConfirmationForm({ ...confirmationForm, message: e.target.value })} rows={4} placeholder="Call message" className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none" />
                </>
              )}

              {(confirmation.type === "sms_send" || confirmation.type === "whatsapp_send") && (
                <>
                  <input value={confirmationForm.toNumber || ""} onChange={(e) => setConfirmationForm({ ...confirmationForm, toNumber: e.target.value })} placeholder="Phone number" className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none" />
                  <input value={confirmationForm.contactName || ""} onChange={(e) => setConfirmationForm({ ...confirmationForm, contactName: e.target.value })} placeholder="Contact name" className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none" />
                  <textarea value={confirmationForm.content || ""} onChange={(e) => setConfirmationForm({ ...confirmationForm, content: e.target.value })} rows={5} placeholder="Message" className="w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-4 py-3 text-sm text-[color:var(--text-primary)] outline-none" />
                </>
              )}

              {(confirmation.type === "calendar_delete" || confirmation.type === "gmail_cancel_schedule" || confirmation.type === "call_cancel") && (
                <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-500">
                  This action will change existing data. Confirm only if this is intended.
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={handleCancelConfirmation} disabled={confirmingAction} className="rounded-xl border border-[color:var(--border)] px-4 py-2 text-sm text-[color:var(--text-secondary)] disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
              <button onClick={handleConfirmAction} disabled={confirmingAction} className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{confirmingAction ? "Confirming..." : "Confirm"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
