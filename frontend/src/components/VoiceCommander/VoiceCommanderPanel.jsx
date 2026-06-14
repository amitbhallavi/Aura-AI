import { useEffect, useMemo, useRef, useState } from "react";
import { voiceAPI } from "../../services/api";

const LANGUAGES = [
  { value: "auto", label: "Auto" },
  { value: "en-IN", label: "English India" },
  { value: "hi-IN", label: "Hindi India" },
  { value: "en-US", label: "English US" },
  { value: "mr-IN", label: "Marathi" },
  { value: "gu-IN", label: "Gujarati" },
  { value: "bn-IN", label: "Bengali" },
  { value: "ta-IN", label: "Tamil" },
  { value: "te-IN", label: "Telugu" },
  { value: "kn-IN", label: "Kannada" },
  { value: "ml-IN", label: "Malayalam" },
  { value: "ur-IN", label: "Urdu" },
  { value: "es-ES", label: "Spanish" },
  { value: "fr-FR", label: "French" },
  { value: "de-DE", label: "German" },
  { value: "ar-SA", label: "Arabic" },
  { value: "ja-JP", label: "Japanese" },
];

const MODES = [
  { value: "press_to_talk", label: "Press" },
  { value: "listen_once", label: "Once" },
  { value: "continuous", label: "Continuous" },
  { value: "hotword", label: "Hey Aura" },
];

function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function createSessionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `voice-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isConfirmText(text) {
  return /\b(yes|confirm|confirmed|haan|ha|okay|ok|kar do|approve)\b/i.test(text || "");
}

function isCancelText(text) {
  return /\b(cancel|stop|nahi|no|mat karo|reject)\b/i.test(text || "");
}

function isStopSpeechText(text) {
  return /\b(stop speaking|stop voice|speech stop|bolna band|voice band)\b/i.test(text || "");
}

export default function VoiceCommanderPanel({
  voiceReply,
  setVoiceReply,
  responseMode,
  speechStatus,
  pendingConfirmation,
  onTranscript,
  onConfirmPending,
  onCancelPending,
  onStopSpeech,
  onPauseSpeech,
  onResumeSpeech,
  onToast,
}) {
  const [voiceMode, setVoiceMode] = useState(() => localStorage.getItem("aura_voice_mode") || "listen_once");
  const [language, setLanguage] = useState(() => localStorage.getItem("aura_voice_language") || "auto");
  const [languageMode, setLanguageMode] = useState(() => localStorage.getItem("aura_voice_language_mode") || "auto");
  const [state, setState] = useState("idle");
  const [partialTranscript, setPartialTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [detectedLanguage, setDetectedLanguage] = useState("");
  const [confidence, setConfidence] = useState(null);
  const [providerStatus, setProviderStatus] = useState(null);
  const [error, setError] = useState("");
  const [meter, setMeter] = useState(0);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timeoutRef = useRef(null);
  const intervalRef = useRef(null);
  const sessionIdRef = useRef(localStorage.getItem("aura_voice_session") || createSessionId());

  const SpeechRecognition = useMemo(() => getSpeechRecognition(), []);
  const hasMediaRecorder = typeof window !== "undefined" && "MediaRecorder" in window;
  const hasMic = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  const useBrowserRecognition = Boolean(SpeechRecognition);
  const isListening = state === "listening";
  const statusText = useBrowserRecognition
    ? `Fast browser STT + ${providerStatus?.ttsEnabled ? "Google voice" : "browser voice"}`
    : providerStatus?.sttEnabled
      ? `Google STT + ${providerStatus?.ttsEnabled ? "Google voice" : "browser voice"}`
      : "Type fallback only";

  useEffect(() => {
    localStorage.setItem("aura_voice_session", sessionIdRef.current);
    localStorage.setItem("aura_voice_mode", voiceMode);
    localStorage.setItem("aura_voice_language", language);
    localStorage.setItem("aura_voice_language_mode", languageMode);
  }, [voiceMode, language, languageMode]);

  useEffect(() => {
    let mounted = true;
    voiceAPI.status({ force: true })
      .then((res) => {
        if (mounted) setProviderStatus(res.data);
      })
      .catch(() => {
        if (mounted) setProviderStatus({ sttEnabled: false, ttsEnabled: false, fallbackProvider: "browser", maxAudioSeconds: 60 });
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    return () => {
      stopListening();
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  function pushError(message) {
    setError(message);
    onToast?.(message);
  }

  function resetMeter() {
    window.clearInterval(intervalRef.current);
    setMeter(0);
  }

  function startMeter() {
    resetMeter();
    intervalRef.current = window.setInterval(() => {
      setMeter((value) => (value >= 5 ? 1 : value + 1));
    }, 180);
  }

  async function processTranscript(text, meta = {}) {
    const clean = String(text || "").trim();
    if (!clean) return;
    setFinalTranscript(clean);
    setPartialTranscript("");
    setDetectedLanguage(meta.detectedLanguage || language);
    setConfidence(typeof meta.confidence === "number" ? meta.confidence : null);

    if (isStopSpeechText(clean)) {
      onStopSpeech?.();
      setState("completed");
      return;
    }

    if (pendingConfirmation && isConfirmText(clean)) {
      await onConfirmPending?.();
      setState("completed");
      return;
    }

    if (pendingConfirmation && isCancelText(clean)) {
      onCancelPending?.();
      setState("completed");
      return;
    }

    setState("thinking");
    await onTranscript?.({
      transcript: clean,
      detectedLanguage: meta.detectedLanguage || language,
      voiceMode,
      sessionId: sessionIdRef.current,
      responseMode,
    });
    setState("completed");

    if (voiceMode === "continuous") {
      window.setTimeout(() => {
        if (!pendingConfirmation) startListening();
      }, 900);
    }
  }

  function startBrowserRecognition() {
    if (!SpeechRecognition) {
      pushError("Voice recognition is not supported in this browser. Please use Chrome or enable cloud STT.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = language === "auto" ? "en-IN" : language;
    recognition.interimResults = true;
    recognition.continuous = voiceMode === "continuous";
    recognitionRef.current = recognition;
    setError("");
    setState("listening");
    setPartialTranscript("");
    startMeter();

    recognition.onresult = (event) => {
      let interim = "";
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) finalText += transcript;
        else interim += transcript;
      }
      if (interim) setPartialTranscript(interim);
      if (finalText) {
        processTranscript(finalText, {
          detectedLanguage: language === "auto" ? recognition.lang : language,
          confidence: event.results[event.results.length - 1]?.[0]?.confidence,
        });
      }
    };
    recognition.onerror = () => {
      resetMeter();
      setState("error");
      pushError("I could not understand the voice clearly. Please try again or type the command.");
    };
    recognition.onend = () => {
      resetMeter();
      setState((current) => current === "listening" ? "idle" : current);
    };
    recognition.start();
  }

  async function startListening() {
    if (isListening) return;
    if (voiceMode === "hotword") {
      pushError("Hey Aura hotword mode is planned, but always-on listening is disabled in this version.");
      return;
    }
    if (useBrowserRecognition) {
      startBrowserRecognition();
      return;
    }
    if (!hasMic || !hasMediaRecorder) {
      if (SpeechRecognition) return startBrowserRecognition();
      pushError("Microphone recording is not supported in this browser.");
      return;
    }

    try {
      setError("");
      setState("requesting_microphone_permission");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : undefined });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        resetMeter();
        stream.getTracks().forEach((track) => track.stop());
        if (!chunksRef.current.length) {
          setState("idle");
          return;
        }
        setState("transcribing");
        try {
          const audioBlob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
          const res = await voiceAPI.transcribe({
            audioBlob,
            sessionId: sessionIdRef.current,
            languageMode,
            language,
          });
          await processTranscript(res.data.transcript, res.data);
        } catch (err) {
          setState("error");
          if (SpeechRecognition) {
            setProviderStatus((current) => ({ ...(current || {}), sttEnabled: false }));
            pushError("Cloud voice recognition is unavailable. Switching to browser recognition.");
            window.setTimeout(() => {
              setState("idle");
              startBrowserRecognition();
            }, 250);
          } else {
            pushError(err.response?.data?.error || "Voice recognition failed. Please type the command.");
          }
        }
      };

      recorder.start();
      setState("listening");
      startMeter();
      const maxSeconds = providerStatus?.maxAudioSeconds || 60;
      timeoutRef.current = window.setTimeout(stopListening, maxSeconds * 1000);
    } catch {
      resetMeter();
      setState("error");
      pushError("Microphone permission denied. Please allow microphone access or type your command.");
    }
  }

  function stopListening() {
    window.clearTimeout(timeoutRef.current);
    if (recognitionRef.current && isListening) {
      try { recognitionRef.current.stop(); } catch {}
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    resetMeter();
    setState((current) => current === "listening" ? "idle" : current);
  }

  const timeline = [
    state === "idle" ? "Ready for voice command" : null,
    state === "requesting_microphone_permission" ? "Requesting microphone permission" : null,
    state === "listening" ? "Listening" : null,
    state === "transcribing" ? "Transcribing your voice" : null,
    state === "thinking" ? "Understanding command" : null,
    pendingConfirmation ? "Waiting for confirmation" : null,
    state === "completed" ? "Completed" : null,
    state === "error" ? "Needs attention" : null,
  ].filter(Boolean);

  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-card)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Voice Commander</h2>
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">
            {statusText}
          </p>
        </div>
        <button
          onClick={() => setVoiceReply((value) => !value)}
          className={`rounded-xl border px-3 py-2 text-xs font-medium ${voiceReply ? "border-emerald-500/30 bg-emerald-500/10 text-[color:var(--online)]" : "border-[color:var(--border)] bg-[color:var(--bg-elevated)] text-[color:var(--text-secondary)]"}`}
        >
          Voice Reply {voiceReply ? "ON" : "OFF"}
        </button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-[color:var(--text-muted)]">
          Mode
          <select value={voiceMode} onChange={(e) => setVoiceMode(e.target.value)} className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-3 py-2 text-xs text-[color:var(--text-primary)] outline-none">
            {MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-[color:var(--text-muted)]">
          Language
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="mt-1 w-full rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] px-3 py-2 text-xs text-[color:var(--text-primary)] outline-none">
            {LANGUAGES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onMouseDown={voiceMode === "press_to_talk" ? startListening : undefined}
          onMouseUp={voiceMode === "press_to_talk" ? stopListening : undefined}
          onTouchStart={voiceMode === "press_to_talk" ? startListening : undefined}
          onTouchEnd={voiceMode === "press_to_talk" ? stopListening : undefined}
          onClick={voiceMode === "press_to_talk" ? undefined : (isListening ? stopListening : startListening)}
          disabled={state === "transcribing" || state === "thinking"}
          className={`flex h-14 w-14 items-center justify-center rounded-2xl text-xl font-semibold text-white shadow-sm transition-transform active:scale-95 disabled:opacity-50 ${isListening ? "bg-red-500" : "bg-violet-500"}`}
          title={isListening ? "Stop listening" : "Start voice command"}
        >
          {isListening ? "■" : "🎙"}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((bar) => (
              <span key={bar} className={`h-2 flex-1 rounded-full ${meter >= bar ? "bg-violet-500" : "bg-[color:var(--bg-elevated)]"}`} />
            ))}
          </div>
          <p className="mt-2 truncate text-xs text-[color:var(--text-secondary)]">
            {partialTranscript || finalTranscript || "Click mic and speak your command"}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 text-xs lg:grid-cols-2">
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] p-3">
          <div className="font-medium text-[color:var(--text-primary)]">Transcript</div>
          <p className="mt-2 min-h-[38px] text-[color:var(--text-secondary)]">{finalTranscript || partialTranscript || "No transcript yet."}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {detectedLanguage && <span className="rounded-full bg-[color:var(--accent-bg)] px-2 py-1 text-[color:var(--accent)]">{detectedLanguage}</span>}
            {confidence !== null && <span className="rounded-full bg-[color:var(--accent-bg)] px-2 py-1 text-[color:var(--accent)]">{Math.round(confidence * 100)}% confidence</span>}
          </div>
        </div>
        <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--bg-elevated)] p-3">
          <div className="font-medium text-[color:var(--text-primary)]">Activity</div>
          <div className="mt-2 space-y-1.5 text-[color:var(--text-secondary)]">
            {timeline.map((item) => (
              <div key={item} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {pendingConfirmation && (
        <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-600">
          Pending action: say “haan confirm” or “cancel karo”, or use the modal.
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-xs text-red-500">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={onPauseSpeech} disabled={speechStatus !== "playing"} className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--text-secondary)] disabled:opacity-40">Pause voice</button>
        <button onClick={onResumeSpeech} disabled={speechStatus !== "paused"} className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--text-secondary)] disabled:opacity-40">Resume</button>
        <button onClick={onStopSpeech} disabled={speechStatus === "idle"} className="rounded-xl border border-[color:var(--border)] px-3 py-2 text-xs text-[color:var(--text-secondary)] disabled:opacity-40">Stop</button>
      </div>
    </div>
  );
}
